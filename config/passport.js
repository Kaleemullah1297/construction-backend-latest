const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const userModel = require("../models/user");
const jwt = require("jsonwebtoken");

//THIS IS FOR LOGIN WITH GOOGLE.

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/api/user/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;

        const existingUser = await userModel.findOne({ email });

        if (existingUser) {
          if (!existingUser.googleId) {
            // Email already used by a password account (not linked to Google)
            return done(null, false, {
              message:
                "This email is already registered using password. Please log in with email and password.",
            });
          }

          // Email + Google ID match → allow login
          return done(null, existingUser);
        }

        // No existing user → create new Google account
        const newUser = await userModel.create({
          email,
          fullName: profile.displayName,
          googleId,
          userType: "donor", // Or default to something else
          password: null,
          isGoogleUser: true, // Optional flag
        });

        return done(null, newUser);
      } catch (err) {
        console.error("Google strategy error:", err);
        return done(err, null);
      }
    }
  )
);

//THIS IS FOR LOGIN WITH FACEBOOK

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
      profileFields: ["id", "emails", "name"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email =
          profile.emails?.[0]?.value || `${profile.id}@facebook.com`;

        // 🔍 Step 1: Check if user exists by facebookId
        let user = await userModel
          .findOne({ facebookId: profile.id })
          .select("-password");

        if (user) {
          // ✅ Existing Facebook user → return token + user
          const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "7d",
          });
          return done(null, { token, user });
        }

        // 🔍 Step 2: Check if a user already exists with the same email
        const emailExists = await userModel.findOne({ email });

        if (emailExists) {
          // ❌ Conflict: user with this email exists (manual or Google signup)
          return done(
            new Error(
              "An account with this email already exists. Please login using your original method."
            ),
            false
          );
        }

        // ✅ Step 3: Create new Facebook user
        user = await userModel.create({
          facebookId: profile.id,
          email,
          name: `${profile.name.givenName} ${profile.name.familyName}`,
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });

        return done(null, { token, user });
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

//THIS IS FOR LOGIN WITH APPLEID

module.exports = passport;
