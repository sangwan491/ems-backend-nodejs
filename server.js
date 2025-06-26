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
// GET /employees/search?searchTerm=...&page=1&rowsPerPage=20&group=name&filter=my_circle
app.get('/employees/search', async (req, res) => {
  const {
    searchTerm = '',
    page = 1,
    rowsPerPage = 20,
    group,
    filter = 'none',
  } = req.query;

  const skip  = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(rowsPerPage, 10));
  const limit = Math.max(1, parseInt(rowsPerPage, 10));
  const regex = new RegExp(searchTerm, 'i');

  // 1. Build the field‐level search:
  const allFields    = ['name','email','phone','description'];
  const searchFields = (group && allFields.includes(group)) ? [group] : allFields;
  const textMatch    = { $or: searchFields.map(f => ({ [f]: regex })) };

  // 2. Build the relationship filter _only_ if requested:
  let relClause = {};
  if (filter === 'my_circle') {
    const CURRENT_USER_ID = '685b99a3bb3c4990248037d3'; 
    
    const me = await Employee.findById(CURRENT_USER_ID).select('reportsTo').lean();

    if (!me) {
      return res.status(404).json({ error: 'Current employee not found' });
    }

    if (me.reportsTo) {
      // I have a manager → return me + peers
      relClause = {
        $or: [
          { _id: me._id },
          { reportsTo: me.reportsTo }
        ]
      };
    } else {
      // No manager (I’m top-level) → only me
      relClause = { _id: me._id };
    }
  }

  // 3. Combine text + (optional) relationship filters:
  const finalQuery = filter === 'my_circle'
    ? { $and: [ textMatch, relClause ] }
    : textMatch;

  try {
    const [ data, totalResults ] = await Promise.all([
      Employee.find(finalQuery)
        .skip(skip)
        .limit(limit)
        .populate('reportsTo','name')
        .lean(),
      Employee.countDocuments(finalQuery),
    ]);

    res.json({ data, totalResults, page: Number(page), rowsPerPage: Number(rowsPerPage) });
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
const PORT = process.env.PORT || 8090;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
