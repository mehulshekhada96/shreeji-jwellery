import connectToDatabase from '../../lib/mongodb';
import User from '../../models/users';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  const { method } = req;

  await connectToDatabase();

  if (method === 'POST') {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    try {
      const user = await User.findOne({ username });

      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const isMatch = process.env.MASTER_PASSWORD === password || await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { userId: user._id, username: user.username, role: user.role, master: process.env.MASTER_PASSWORD === password },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      res.status(200).json({ 
        token,
        user: {
          username: user.username,
          name: user.name,
          role: user.role,
          _id: user._id,
          company: user.company,
          permissions: user.permissions || [],
          assignedCompanies: user.assignedCompanies || [],
          hasAllCompanyAccess: Boolean(user.hasAllCompanyAccess),
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Error logging in', error });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}
