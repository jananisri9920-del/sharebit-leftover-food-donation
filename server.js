require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["donor", "receiver", "admin"], default: "donor" }
}, { timestamps: true });

const donationSchema = new mongoose.Schema({
  donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  donorName: { type: String, required: true },
  foodName: { type: String, required: true, trim: true, maxlength: 100 },
  foodType: { type: String, enum: ["Vegetarian", "Non-vegetarian", "Vegan", "Bakery", "Packaged"], required: true },
  quantity: { type: Number, required: true, min: 1, max: 100000 },
  unit: { type: String, enum: ["meals", "kg", "packets"], default: "meals" },
  description: { type: String, maxlength: 500, default: "" },
  location: { type: String, required: true, trim: true, maxlength: 200 },
  preparedAt: { type: Date, required: true },
  pickupUntil: { type: Date, required: true },
  contactPhone: { type: String, required: true },
  status: { type: String, enum: ["Available", "Requested", "Accepted", "Collected", "Expired", "Cancelled"], default: "Available" },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  requestMessage: { type: String, maxlength: 300, default: "" }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Donation = mongoose.model("Donation", donationSchema);

function tokenFor(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Please log in to continue." });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "Account not found." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required." });
  next();
}
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

app.get("/api/health", (req, res) => res.json({ status: "ok", app: "ShareBit" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !phone || !password) return res.status(400).json({ message: "Please fill in every required field." });
    if (String(password).length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
    if (!/^[0-9+\-\s()]{10,18}$/.test(String(phone))) return res.status(400).json({ message: "Enter a valid phone number." });
    const cleanEmail = String(email).trim().toLowerCase();
    if (await User.findOne({ email: cleanEmail })) return res.status(409).json({ message: "An account with this email already exists." });
    const safeRole = ["donor", "receiver"].includes(role) ? role : "donor";
    const user = await User.create({
      name: String(name).trim(), email: cleanEmail, phone: String(phone).trim(),
      passwordHash: await bcrypt.hash(password, 12), role: safeRole
    });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ message: "Could not create account. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: "Email or password is incorrect." });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch {
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/donations", async (req, res) => {
  try {
    const filter = {};
    if (req.query.mine === "true") {
      const header = req.headers.authorization || "";
      if (!header.startsWith("Bearer ")) return res.status(401).json({ message: "Please log in." });
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      filter.donor = payload.id;
    } else {
      filter.status = { $in: ["Available", "Requested"] };
      if (req.query.search) {
        const q = String(req.query.search).slice(0, 100);
        filter.$or = [
          { foodName: { $regex: q, $options: "i" } },
          { location: { $regex: q, $options: "i" } },
          { foodType: { $regex: q, $options: "i" } }
        ];
      }
    }
    const donations = await Donation.find(filter).sort({ createdAt: -1 }).limit(200).populate("requestedBy", "name email phone");
    res.json({ donations });
  } catch {
    res.status(500).json({ message: "Could not load donations." });
  }
});

app.post("/api/donations", auth, async (req, res) => {
  try {
    const { foodName, foodType, quantity, unit, description, location, preparedAt, pickupUntil, contactPhone } = req.body;
    if (!foodName || !foodType || !quantity || !location || !preparedAt || !pickupUntil || !contactPhone)
      return res.status(400).json({ message: "Please complete all required donation fields." });
    const prepared = new Date(preparedAt), until = new Date(pickupUntil);
    if (Number.isNaN(prepared.getTime()) || Number.isNaN(until.getTime()) || until <= new Date())
      return res.status(400).json({ message: "Please enter valid preparation and pickup times. Pickup deadline must be in the future." });
    if (prepared > new Date(Date.now() + 5 * 60 * 1000)) return res.status(400).json({ message: "Preparation time cannot be in the future." });
    const donation = await Donation.create({
      donor: req.user._id, donorName: req.user.name, foodName, foodType,
      quantity: Number(quantity), unit: unit || "meals", description: description || "",
      location, preparedAt: prepared, pickupUntil: until, contactPhone
    });
    res.status(201).json({ donation, message: "Your food donation has been published." });
  } catch (e) {
    res.status(400).json({ message: "Could not publish donation. Check the details and quantity." });
  }
});

app.post("/api/donations/:id/request", auth, async (req, res) => {
  try {
    if (req.user.role === "donor") return res.status(403).json({ message: "Please register as a receiver to request food." });
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: "Donation not found." });
    if (donation.donor.toString() === req.user._id.toString()) return res.status(400).json({ message: "You cannot request your own donation." });
    if (donation.status !== "Available") return res.status(409).json({ message: "This donation is no longer available." });
    donation.status = "Requested";
    donation.requestedBy = req.user._id;
    donation.requestMessage = String(req.body.message || "").slice(0, 300);
    await donation.save();
    res.json({ message: "Request sent to the donor.", donation });
  } catch {
    res.status(500).json({ message: "Could not submit request." });
  }
});

app.patch("/api/donations/:id/status", auth, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ message: "Donation not found." });
    const isOwner = donation.donor.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") return res.status(403).json({ message: "Only the donor or admin can update this donation." });
    const allowed = ["Accepted", "Collected", "Cancelled", "Available"];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid status." });
    if (req.body.status === "Accepted" && donation.status !== "Requested") return res.status(400).json({ message: "A request must exist before accepting." });
    donation.status = req.body.status;
    if (req.body.status === "Available") { donation.requestedBy = null; donation.requestMessage = ""; }
    await donation.save();
    res.json({ message: "Donation status updated.", donation });
  } catch {
    res.status(500).json({ message: "Could not update donation status." });
  }
});

app.get("/api/my-activity", auth, async (req, res) => {
  try {
    let donations;
    if (req.user.role === "admin") {
      donations = await Donation.find().populate("donor", "name email phone").populate("requestedBy", "name email phone").sort({ createdAt: -1 }).limit(500);
    } else if (req.user.role === "receiver") {
      donations = await Donation.find({ requestedBy: req.user._id }).populate("donor", "name email phone").sort({ createdAt: -1 }).limit(200);
    } else {
      donations = await Donation.find({ donor: req.user._id }).populate("requestedBy", "name email phone").sort({ createdAt: -1 }).limit(200);
    }
    if (req.user.role === "admin") {
      const users = await User.find().select("-passwordHash").sort({ createdAt: -1 }).limit(500);
      return res.json({ donations, users, role: req.user.role });
    }
    res.json({ donations, role: req.user.role });
  } catch {
    res.status(500).json({ message: "Could not load your dashboard." });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const [totalDonations, available, collected, totalMeals] = await Promise.all([
      Donation.countDocuments({ status: { $ne: "Cancelled" } }),
      Donation.countDocuments({ status: "Available" }),
      Donation.countDocuments({ status: "Collected" }),
      Donation.aggregate([{ $match: { status: { $ne: "Cancelled" } } }, { $group: { _id: null, total: { $sum: "$quantity" } } }])
    ]);
    res.json({ totalDonations, available, collected, totalMeals: totalMeals[0]?.total || 0 });
  } catch {
    res.status(500).json({ message: "Could not load dashboard." });
  }
});

app.get("/api/admin/overview", auth, adminOnly, async (req, res) => {
  const [users, donations] = await Promise.all([
    User.find().select("-passwordHash").sort({ createdAt: -1 }).limit(500),
    Donation.find().populate("donor", "name email").populate("requestedBy", "name email").sort({ createdAt: -1 }).limit(500)
  ]);
  res.json({ users, donations });
});

// Make the first admin manually by setting role="admin" for your account in MongoDB Atlas.
// This prevents public users from granting themselves admin privileges.
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI. Copy .env.example to .env and configure MongoDB Atlas.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected.");
  app.listen(PORT, () => console.log(`ShareBit is running on port ${PORT}`));
}
start().catch(err => { console.error("Startup error:", err.message); process.exit(1); });
