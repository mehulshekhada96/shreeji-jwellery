import connectToDatabase from '../../lib/mongodb';
import OrderFile from '../../models/OrderFile';
import moment from 'moment-timezone';
import Item from '../../models/items';
import Section from '../../models/section';
import mongoose from 'mongoose';
import { authMiddleware } from './common/common.services';

const handler = async (req, res) => {
  const { method } = req;

  await connectToDatabase();

  if (method === 'GET') {
    const query = req.query;
    const { section } = query;
    const company = req.userData?.company;
    try {
      let criteria = { isDeleted: false, company };
      if (section) {
        criteria.section = new mongoose.Types.ObjectId(section);
      }

      const items = await Item.find(criteria).lean();
      res.status(200).json({ items, message: 'Items fetched successfully!' });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error fetching Items from the database', error: error.message });
    }
  } else if (method === 'POST') {
    const body = req.body;
    const { _id, company } = req.userData;
    const { name, rate, section, imageUrl } = body;

    try {
      // Get the section details to check if it's "Final Product"
      const sectionDetails = await Section.findById(section).lean();
      
      if (!sectionDetails) {
        return res.status(404).json({ message: 'Section not found' });
      }

      // Check if the section is "Final Product" (case-insensitive)
      const isFinalProductSection = sectionDetails.name.toLowerCase() === 'final product';

      const itemPayload = (sec) => ({
        name,
        rate,
        section: sec._id,
        lastModifiedBy: _id,
        company,
        ...(imageUrl && { imageUrl }),
      });

      if (isFinalProductSection) {
        // If it's Final Product, add the item to ALL sections (same imageUrl for each)
        const allSections = await Section.find({ isDeleted: false, company }).lean();
        
        const itemsToCreate = allSections.map(sec => itemPayload(sec));

        // Bulk insert all items
        const createdItems = await Item.insertMany(itemsToCreate);
        
        // Return the item that was created for the Final Product section
        const finalProductItem = createdItems.find(item => 
          item.section.toString() === section.toString()
        );

        return res.status(200).json({ 
          message: 'Item created successfully in all sections!', 
          item: finalProductItem || createdItems[0],
          itemsCreated: createdItems.length
        });
      } else {
        // Normal behavior: create item only in the selected section
        const item = new Item(itemPayload({ _id: section }));
        const result = await item.save();
        return res.status(200).json({ message: 'Item created successfully!', item: result });
      }
    } catch (error) {
      res.status(500).json({ message: 'Error creating item', error: error.message });
    }
  } else if (method === 'DELETE') {
    const { _id, company } = req.userData;
    const body = req.body;
    const { id } = body;
    try {
      const result = await Item.updateOne(
        { _id: id, company },
        { $set: { isDeleted: true, lastModifiedBy: _id } }
      );
      res.status(200).json({ result, message: 'Item deleted successfully!' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting item', error: error.message });
    }
  } else if (method === 'PUT') {
    const userId = req?.userData?._id;
    const company = req?.userData?.company;
    const body = req.body;
    const { _id, name, user, rate, section, imageUrl, applyToSameNameItems } = body;
    try {
      const item = await Item.findOne({ _id, company, isDeleted: false }).lean();
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }

      // Image update (replace or delete): only when explicitly requested (applyToSameNameItems is boolean)
      if (imageUrl !== undefined && typeof applyToSameNameItems === 'boolean') {
        const filter = applyToSameNameItems
          ? { name: item.name, company, isDeleted: false }
          : { _id, company };
        await Item.updateMany(filter, {
          $set: { imageUrl: imageUrl || null, lastModifiedBy: userId },
        });
      }

      // Name/rate/section update (single item only)
      const hasFieldUpdate = name !== undefined || rate !== undefined || section !== undefined;
      if (hasFieldUpdate) {
        const updateFields = { lastModifiedBy: userId };
        if (name !== undefined) updateFields.name = name;
        if (rate !== undefined) updateFields.rate = rate;
        if (section !== undefined) updateFields.section = section;
        await Item.updateOne({ _id, company }, { $set: updateFields });
      }

      const updatedItem = await Item.findById(_id).lean();
      res.status(200).json({
        item: updatedItem,
        message: imageUrl !== undefined && applyToSameNameItems
          ? 'Image updated for all same-name items!'
          : 'Item updated successfully!',
      });
    } catch (error) {
      res.status(500).json({ message: 'Error updating item', error: error.message });
    }
  } else {
    res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default authMiddleware(handler);
