const { User } = require("./server/models");
const mongoose = require("mongoose");
require("dotenv").config();

async function checkUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOne({ email: "admin@guardianplatform.com" });
    console.log("User 2FA structure:");
    console.log(JSON.stringify(user.twoFactorAuth, null, 2));
    mongoose.connection.close();
  } catch (error) {
    console.error("Error:", error);
    mongoose.connection.close();
  }
}

checkUser();
