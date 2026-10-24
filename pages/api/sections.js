import connectToDatabase from '../../lib/mongodb';
import Section from '../../models/section';
import mongoose from 'mongoose';
import items from '../../models/items';
import { authMiddleware } from './common/common.services';
const handler = async (req, res) => {
  const { method, query, userData } = req;

  await connectToDatabase();

  if (method === 'GET') {
  try {
    const sections = await Section.find({isDeleted: false, company : userData?.company}).populate({path: 'lastModifiedBy', select: 'name'}).lean();
    res.status(200).json({ sections, message: 'Sections fetched successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message, message: 'Error fetching sections from the database' }); // Added separate message key
  }


  }if(method === 'POST'){
    const {userData} = req;

    const body = req.body;
    const {name} = body;
    const section = new Section({name, lastModifiedBy : userData?._id, company : userData?.company });
    try {
      await section.save();
      res.status(200).json({message: 'Section created successfully!'});
    } catch (error) {
      res.status(500).json({error: error.message, message: 'Error creating section' }); // Added separate message key
    }
  } 
  else if(method === 'DELETE'){
    const body = req.body;
    const {id} = body;
    try {
        const result = await Section.updateOne({_id: id }, {$set : {isDeleted: true}});
        await items.updateMany({section: id}, {$set : {isDeleted: true}});
        res.status(200).json({ result, message: 'Section deleted successfully!'});
    }
    catch (error) {
      res.status(500).json({error: error.message, message: 'Error deleting section' }); // Added separate message key
    }
  } else if (method === 'PUT') {
    const body = req.body;
    
    const { _id, name, user } = body;
    const updateFields = {};
    if (name) updateFields.name = name;
    if (user) updateFields.user = {userId : user._id, name: user.name};
    try {
      const result = await Section.updateOne({ _id: new mongoose.Types.ObjectId(_id)  }, { $set: updateFields });
      res.status(200).json({ result, message: 'Section updated successfully!' });
    } catch (error) {
      res.status(500).json({ error: error.message, message: 'Error updating section' }); // Added separate message key
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default authMiddleware(handler);