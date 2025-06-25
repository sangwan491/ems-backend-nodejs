// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:8093',
  credentials: true
};

app.use(require('cors')(corsOptions)); 

app.use(bodyParser.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mydb';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const { Schema } = mongoose;
const EmployeeSchema = new Schema({
  name:        { type: String, required: true, index: true },
  description: String,
  email:       { type: String, required: true, unique: true },
  phone:       String,
  reportsTo:   { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  img:         { type: String },
}, { timestamps: true });

const Employee = mongoose.model('Employee', EmployeeSchema);

// 2. CREATE (POST) /employees
app.post('/employees', async (req, res) => {
  try {
    const emp = new Employee(req.body);
    const saved = await emp.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. SIMPLE LIST of all employees (only _id + name)
//    GET /employees/simple
app.get('/employees/simple', async (req, res) => {
  try {
    const list = await Employee.find({}, { name: 1 }).exec();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. HIERARCHY (nested JSON)
//    GET /employees/hierarchy
app.get('/employees/hierarchy', async (req, res) => {
  try {
    const all = await Employee.find({}).lean().exec();
    const byId = {};
    all.forEach(emp => {
      emp.children = [];
      byId[emp._id] = emp;
    });
    const roots = [];

    all.forEach(emp => {
      if (emp.reportsTo) {
        const parent = byId[emp.reportsTo];
        if (parent) parent.children.push(emp);
      } else {
        roots.push(emp);
      }
    });

    res.json(roots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. SEARCH + PAGINATION
//    GET /employees/search/:searchTerm/page/:page
//    returns at most 20 records/page, case-insensitive match on name or email
app.get('/employees/search', async (req, res) => {
  const searchTerm = req.query.searchTerm || '';
  const page = parseInt(req.query.page, 10) || 1;
  const rowsPerPage = parseInt(req.query.rowsPerPage, 10) || 20;
  
  const skip = (page - 1) * rowsPerPage;
  const limit = rowsPerPage;

  const regex = new RegExp(searchTerm, 'i');

  try {
    const docs = await Employee.find({
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { description: regex },
      ]
    })
    .skip(skip)
    .limit(limit)
    .populate('reportsTo', 'name')
    .exec();

    const total = await Employee.countDocuments({
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { description: regex },
      ]
    });

    res.json({
      data: docs,
      totalResults: total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 3. READ (GET by id) /employees/:id
app.get('/employees/:id', async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).exec();
    if (!emp) return res.status(404).json({ error: 'Not found' });
    res.json(emp);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ---------- PUT /employees/:id ----------
app.put('/employees/:id', async (req, res) => {
  try {
    const update = {
      name       : req.body.name,
      description: req.body.description,
      email      : req.body.email,
      phone      : req.body.phone,
      reportsTo  : req.body.reportsTo || null,
    };

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true },
    ).exec();

    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. DELETE /employees/:id
app.delete('/employees/:id', async (req, res) => {
  try {
    const deleted = await Employee.findByIdAndDelete(req.params.id).exec();
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



// START SERVER
const PORT = process.env.PORT || 8089;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
