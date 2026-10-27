import { authMiddleware } from './common/common.services';
import SkuInventory from '../../models/SkuInventory';
import Company from '../../models/company';
import { USER_ROLES } from '../../lib/constants';
import connectToDatabase from '../../lib/mongodb';
import { getCompanyMappingInfo } from '../../lib/companyMappingHelper';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

async function handler(req, res) {
    await connectToDatabase();
    
    const user = req.userData;
    if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check permissions
    if (![USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ADMINISTRATOR].includes(user.role)) {
        return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const company = await Company.findById(user.company).lean();
    if (!company) {
        return res.status(404).json({ message: 'Company not found' });
    }

    if (!company.featureFlags?.isExtractSKU) {
        return res.status(403).json({ message: 'SKU feature is disabled for your company' });
    }

    // GET - Fetch SKU inventory data with filters
    if (req.method === 'GET') {
        try {
            const { startDate, endDate, companyName, sku, platform } = req.query;

            // Build match stage for aggregation pipeline
            const matchStage = {
                company: user.company,
                isDeleted: false
            };

            // Platform filter (flipkart, snapdeal, myntra, amazon, or meesho)
            if (platform === 'flipkart') {
                matchStage.platform = 'flipkart';
            } else if (platform === 'snapdeal') {
                matchStage.platform = 'snapdeal';
            } else if (platform === 'myntra') {
                matchStage.platform = 'myntra';
            } else if (platform === 'amazon') {
                matchStage.platform = 'amazon';
            } else if (platform === 'meesho') {
                matchStage.platform = { $nin: ['flipkart', 'snapdeal', 'myntra', 'amazon'] };
            }

            // Date filter
            if (startDate || endDate) {
                matchStage.selectedDate = {};
                if (startDate) {
                    matchStage.selectedDate.$gte = new Date(startDate);
                }
                if (endDate) {
                    const endDateTime = new Date(endDate);
                    endDateTime.setHours(23, 59, 59, 999);
                    matchStage.selectedDate.$lte = endDateTime;
                }
            }

            // Company name filter with mapped alias expansion
            if (companyName) {
                const { aliasMap } = await getCompanyMappingInfo(user.company, platform);
                const targetUpper = companyName.trim().toUpperCase();
                const matchedRawNames = [targetUpper];
                for (const [rawUpper, canonicalUpper] of aliasMap.entries()) {
                    if (canonicalUpper === targetUpper) {
                        matchedRawNames.push(rawUpper);
                    }
                }
                const regexList = [...new Set(matchedRawNames)].map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
                matchStage.companyName = regexList.length === 1 ? regexList[0] : { $in: regexList };
            }

            // SKU filter
            if (sku) {
                matchStage.sku = { $regex: sku.trim(), $options: 'i' };
            }

            // Aggregation pipeline 1: Aggregate by company and SKU (for main table display)
            const companySkuAggregation = [
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            companyName: { $trim: { input: '$companyName' } },
                            sku: '$sku'
                        },
                        totalQuantity: { $sum: '$quantity' }
                    }
                },
                {
                    $group: {
                        _id: '$_id.companyName',
                        skus: {
                            $push: {
                                sku: '$_id.sku',
                                quantity: '$totalQuantity'
                            }
                        }
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 100 } // Limit number of companies to prevent slowdown
            ];

            // Aggregation pipeline 2: Aggregate by date and company (for calendar view)
            // This creates records similar to rawData but pre-aggregated
            // Reduced limit to prevent exceeding Vercel's 4.5MB response limit and 10s timeout
            const dateCompanyAggregation = [
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            selectedDate: '$selectedDate',
                            companyName: { $trim: { input: '$companyName' } }
                        },
                        quantity: { $sum: '$quantity' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        selectedDate: '$_id.selectedDate',
                        companyName: '$_id.companyName',
                        quantity: 1,
                        sku: '' // Empty SKU since we're aggregating
                    }
                },
                { $sort: { selectedDate: -1, companyName: 1 } },
                { $limit: 5000 } // Further reduced from 10k to 5k for Hobby plan 10s timeout
            ];

            // Run both aggregations in parallel
            // Use allowDiskUse for large datasets to prevent memory issues
            const [companySkuResults, dateCompanyResults] = await Promise.all([
                SkuInventory.aggregate(companySkuAggregation).allowDiskUse(true),
                SkuInventory.aggregate(dateCompanyAggregation).allowDiskUse(true)
            ]);

            // Transform company+SKU aggregation results
            const aggregated = {};
            companySkuResults.forEach(result => {
                const trimmedCompanyName = result._id?.trim();
                if (!trimmedCompanyName) return;

                aggregated[trimmedCompanyName] = {};
                result.skus.forEach(skuItem => {
                    aggregated[trimmedCompanyName][skuItem.sku] = skuItem.quantity;
                });
            });

            // Transform date+company aggregation results to match rawData format
            const rawData = dateCompanyResults.map(result => ({
                selectedDate: result.selectedDate,
                companyName: result.companyName,
                quantity: result.quantity,
                sku: result.sku || ''
            }));

            const responseData = {
                success: true,
                data: aggregated,
                rawData: rawData
            };

            // Check if client accepts gzip
            const acceptEncoding = req.headers['accept-encoding'] || '';
            
            if (acceptEncoding.includes('gzip')) {
                // Compress response with gzip
                const jsonString = JSON.stringify(responseData);
                const compressed = await gzip(jsonString);
                
                res.setHeader('Content-Encoding', 'gzip');
                res.setHeader('Content-Type', 'application/json');
                return res.status(200).send(compressed);
            } else {
                // Send uncompressed if client doesn't support gzip
                return res.status(200).json(responseData);
            }
        } catch (error) {
            console.error('Error fetching SKU inventory:', error);
            return res.status(500).json({ message: 'Error fetching data', error: error.message });
        }
    }

    // POST - Upload SKU inventory data
    if (req.method === 'POST') {
        try {
            const { selectedDate, skuData, platform } = req.body;

            if (!selectedDate || !skuData || typeof skuData !== 'object') {
                return res.status(400).json({ message: 'Invalid data format' });
            }

            const date = new Date(selectedDate);
            const records = [];

            // Prepare bulk insert data (trim company names and SKUs)
            for (const companyName in skuData) {
                const trimmedCompanyName = companyName.trim();
                if (!trimmedCompanyName) continue; // Skip empty company names
                
                const skus = skuData[companyName];
                for (const sku in skus) {
                    const trimmedSku = sku.trim();
                    if (!trimmedSku) continue; // Skip empty SKUs
                    
                    const record = {
                        company: user.company,
                        companyName: trimmedCompanyName,
                        sku: trimmedSku,
                        quantity: skus[sku],
                        selectedDate: date,
                        uploadedBy: user._id,
                        uploadedByName: user.username || user.email
                    };
                    // Set platform for flipkart, snapdeal, or myntra
                    if (platform === 'flipkart') {
                        record.platform = 'flipkart';
                    } else if (platform === 'snapdeal') {
                        record.platform = 'snapdeal';
                    } else if (platform === 'myntra') {
                        record.platform = 'myntra';
                    }
                    records.push(record);
                }
            }

            if (records.length === 0) {
                return res.status(400).json({ message: 'No SKU data to upload' });
            }

            // Insert all records
            const result = await SkuInventory.insertMany(records);

            return res.status(201).json({
                success: true,
                message: `Successfully uploaded ${result.length} SKU records`,
                count: result.length
            });
        } catch (error) {
            console.error('Error uploading SKU inventory:', error);
            return res.status(500).json({ message: 'Error uploading data', error: error.message });
        }
    }

    // DELETE - Delete SKU inventory data by date
    if (req.method === 'DELETE') {
        try {
            const { date, platform } = req.query;

            if (!date) {
                return res.status(400).json({ message: 'Date is required' });
            }

            const targetDate = new Date(date);
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);

            // Build delete query
            const deleteQuery = {
                company: user.company,
                selectedDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                },
                isDeleted: false
            };
            // Filter by platform for Flipkart, Snapdeal, Myntra, Amazon, or Meesho
            if (platform === 'flipkart') {
                deleteQuery.platform = 'flipkart';
            } else if (platform === 'snapdeal') {
                deleteQuery.platform = 'snapdeal';
            } else if (platform === 'myntra') {
                deleteQuery.platform = 'myntra';
            } else if (platform === 'amazon') {
                deleteQuery.platform = 'amazon';
            } else if (platform === 'meesho') {
                deleteQuery.platform = { $nin: ['flipkart', 'snapdeal', 'myntra', 'amazon'] };
            }

            // Soft delete
            const result = await SkuInventory.updateMany(
                deleteQuery,
                {
                    $set: { isDeleted: true }
                }
            );

            return res.status(200).json({
                success: true,
                message: `Successfully deleted ${result.modifiedCount} records`,
                count: result.modifiedCount
            });
        } catch (error) {
            console.error('Error deleting SKU inventory:', error);
            return res.status(500).json({ message: 'Error deleting data', error: error.message });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
}

export default authMiddleware(handler);

