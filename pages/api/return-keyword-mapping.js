import ReturnKeywordMapping from '../../models/ReturnKeywordMapping';
import { authMiddleware } from './common/common.services';
import connectToDatabase from '../../lib/mongodb';

async function handler(req, res) {
  const { method } = req;

  try {
    const user = req.userData;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await connectToDatabase();

    if (method === 'GET') {
      const query = { isDeleted: false };
      if (user.company) {
        query.$or = [{ company: user.company }, { company: null }, { company: { $exists: false } }];
      }
      const mappings = await ReturnKeywordMapping.find(query).sort({ keyword: 1 }).lean();
      return res.status(200).json({ success: true, mappings });
    }

    if (method === 'POST') {
      // Support both single object { keyword, category } and array { mappings: [{ keyword, category }] }
      const { keyword, category, mappings: batchMappings } = req.body;

      if (Array.isArray(batchMappings) && batchMappings.length > 0) {
        const saved = [];
        for (const item of batchMappings) {
          const kw = String(item.keyword || '').trim().toUpperCase();
          const cat = String(item.category || '').toLowerCase();
          if (!kw || (cat !== 'rto' && cat !== 'customer')) continue;

          const query = { keyword: kw, isDeleted: false };
          if (user.company) query.company = user.company;

          const updated = await ReturnKeywordMapping.findOneAndUpdate(
            query,
            { keyword: kw, category: cat, company: user.company, isDeleted: false },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          saved.push(updated);
        }
        return res.status(201).json({ success: true, count: saved.length, mappings: saved });
      }

      const kw = String(keyword || '').trim().toUpperCase();
      const cat = String(category || '').toLowerCase();

      if (!kw || (cat !== 'rto' && cat !== 'customer')) {
        return res.status(400).json({ message: 'Valid keyword and category (rto or customer) are required' });
      }

      const query = { keyword: kw, isDeleted: false };
      if (user.company) query.company = user.company;

      const updated = await ReturnKeywordMapping.findOneAndUpdate(
        query,
        { keyword: kw, category: cat, company: user.company, isDeleted: false },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.status(201).json({ success: true, mapping: updated });
    }

    if (method === 'DELETE') {
      const { id, keyword } = req.body || req.query;

      if (!id && !keyword) {
        return res.status(400).json({ message: 'ID or keyword is required for deletion' });
      }

      const query = id ? { _id: id } : { keyword: String(keyword).trim().toUpperCase() };
      if (user.company) query.company = user.company;

      await ReturnKeywordMapping.updateMany(query, { isDeleted: true });
      return res.status(200).json({ success: true, message: 'Return keyword mapping deleted successfully' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    console.error('ReturnKeywordMapping error:', error);
    return res.status(500).json({ message: 'Error processing request', error: String(error) });
  }
}

export default authMiddleware(handler);
