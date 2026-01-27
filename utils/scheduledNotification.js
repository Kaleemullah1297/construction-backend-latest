const cron = require("node-cron");
const moment = require("moment");
const donationModel = require("../models/donation");
const admin = require("../config/firebase");

// Reusable FCM sender
const sendNotification = async (deviceTokens, title, body) => {
  const tokens = Array.isArray(deviceTokens) ? deviceTokens : [deviceTokens];
  const validTokens = tokens.filter(
    (token) => typeof token === "string" && token.trim() !== ""
  );

  if (!validTokens.length) {
    console.warn("⛔ No valid device tokens.");
    return false;
  }

  try {
    await Promise.all(
      validTokens.map((token) =>
        admin.messaging().send({
          token,
          notification: { title, body },
        })
      )
    );
    return true;
  } catch (err) {
    console.error("❌ FCM Error:", err.message);
    return false;
  }
};

// Scheduled Cron Job
const scheduleDonationNotifications = () => {
  cron.schedule("0 */2 * * *", async () => {
    const now = moment();
    if (now.format("HH:mm") !== "10:00") return;

    console.log("🔔 Running donation notifications at 10AM...");

    try {
      const donations = await donationModel
        .find({
          scheduleById: { $ne: null },
          donationStatus: { $nin: ["completed", "cancelled"] },
        })
        .populate({
          path: "scheduleById",
          select: "fullName deviceId",
        });

      for (const donation of donations) {
        const receiver = donation.scheduleById;
        const scheduledDate = moment(donation.scheduleDate).startOf("day");
        const today = now.clone().startOf("day");
        const daysDiff = today.diff(scheduledDate, "days");

        if (
          !receiver ||
          !Array.isArray(receiver.deviceId) ||
          receiver.deviceId.every(
            (t) => !t || typeof t !== "string" || t.trim() === ""
          )
        ) {
          console.warn(
            `⛔ Skipped: Missing or invalid deviceId for ${receiver?.fullName}`
          );
          continue;
        }

        let title = "";
        let body = "";

        if (daysDiff === -1) {
          title = "Reminder";
          body = "Your donation is scheduled for tomorrow.";
        } else if (daysDiff === 0) {
          title = "Today’s the Day!";
          body =
            "Your donation is scheduled for today. Be ready to receive it.";
        } else if (
          daysDiff > 0 &&
          daysDiff <= 7 &&
          !donation.delivery &&
          !donation.pickup
        ) {
          title = "Still waiting...";
          body = "We still have a donation for you. Do you want to receive it?";
        } else {
          continue;
        }

        await sendNotification(receiver.deviceId, title, body);
      }

      console.log("✅ Notifications sent.");
    } catch (err) {
      console.error("❌ Cron job error:", err.message);
    }
  });
};

// Export function to be called in server.js
module.exports = scheduleDonationNotifications;
