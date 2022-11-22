const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const morgan = require("morgan");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middlewares

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Custome middlewares

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).json({
      status: "fail",
      message: "unauthorized access",
    });
  }

  const [_, token] = authorization.split(" ");

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        status: "fail",
        message: "unauthorized access",
      });
    }

    req.decoded = decoded;
    next();
  });
};

// Connect to mongoDB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6ayglwi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// APIs

async function run() {
  try {
    const db = client.db("doctorsPortal");
    const appointmentOptionsCollection = db.collection("appointmentOptions");
    const bookingsCollection = db.collection("bookings");
    const usersCollection = db.collection("users");
    const doctorsCollection = db.collection("doctors");
    const paymentsCollection = db.collection("payments");

    // Read all appointment options
    app.get("/api/v1/appointment-options", async (req, res) => {
      const date = req.query.date;
      const query = {};

      const appointmentOptions = await appointmentOptionsCollection
        .find(query)
        .toArray();

      const alreadyBooked = await bookingsCollection
        .find({
          appointmentDate: date,
        })
        .toArray();

      appointmentOptions.forEach((option) => {
        const bookedSlotes = alreadyBooked
          .filter((booked) => booked.treatmentName === option.name)
          .map((booked) => booked.slot);

        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlotes.includes(slot)
        );

        option.slots = remainingSlots;
      });

      res.status(200).json({
        status: "success",
        data: {
          appointmentOptions,
        },
      });
    });

    // Read specialty
    app.get("/api/v1/appointment-specialty", async (req, res) => {
      const specialties = await appointmentOptionsCollection
        .find({})
        .project({ name: 1 })
        .toArray();

      res.status(200).json({
        status: "success",
        data: {
          specialties,
        },
      });
    });

    // Read a specific booking

    app.get("/api/v1/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };

      const booking = await bookingsCollection.findOne(query);

      res.status(200).json({
        status: "success",
        data: {
          booking,
        },
      });
    });

    // Read a spesific persones booking

    app.get("/api/v1/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const { email: decondedEmail } = req.decoded;
      const query = { email: email };

      if (decondedEmail !== email) {
        res.status(403).json({
          status: "fail",
          message: "unauthorized access",
        });
      }

      const bookings = await bookingsCollection.find(query).toArray();

      res.status(200).json({
        status: "success",
        data: {
          bookings,
        },
      });
    });

    // Create a booking

    app.post("/api/v1/bookings", async (req, res) => {
      const booking = req.body;

      const query = {
        email: booking.email,
        appointmentDate: booking.appointmentDate,
        treatmentName: booking.treatmentName,
      };

      const alreadyBooked = await bookingsCollection.find(query).toArray();

      if (alreadyBooked.length) {
        return res.status(200).json({
          status: "fail",
          message: `You already have an appointment for ${booking.treatmentName} on ${booking.appointmentDate}`,
        });
      }

      const result = await bookingsCollection.insertOne(booking);

      booking._id = result.insertedId;

      res.status(201).json({
        status: "success",
        data: {
          booking,
        },
      });
    });

    // Payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/api/v1/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);

      res.send(result);
    });

    // Create a user
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;

      const result = await usersCollection.insertOne(user);

      user._id = result.insertedId;

      res.status(201).json({
        status: "success",
        data: {
          user,
        },
      });
    });

    // Read all users

    app.get("/api/v1/users", async (req, res) => {
      const query = {};

      const users = await usersCollection.find(query).toArray();
      const count = await usersCollection.estimatedDocumentCount();

      res.status(200).json({
        status: "success",
        result: count,
        data: {
          users,
        },
      });
    });

    // Make admin role

    app.put("/api/v1/users/admin/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const options = { upsert: true };

      const { email: decondedEmail } = req.decoded;
      const filter = { email: decondedEmail };

      const user = await usersCollection.findOne(filter);

      if (user.role !== "admin") {
        return res.status(400).json({
          status: "fail",
        });
      }

      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc, options);

      res.status(200).json({
        status: "success",
        data: {
          result,
        },
      });
    });

    // Check is admin

    app.get("/api/v1/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);

      res.send({ isAdmin: user?.role === "admin" });
    });

    // Create and send jwt token
    app.get("/api/v1/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email };

      const existingUser = await usersCollection.findOne(query);

      if (!existingUser) {
        return res.status(401).json({
          status: "fail",
          message: "unauthorized access",
        });
      }

      jwt.sign(
        { email },
        process.env.ACCESS_TOKEN,
        { expiresIn: "1h" },
        function (err, token) {
          res.status(200).json({
            status: "success",
            data: {
              accessToken: token,
            },
          });
        }
      );
    });

    // Create a doctor

    app.post("/api/v1/doctors", async (req, res) => {
      const doctor = req.body;

      const result = await doctorsCollection.insertOne(doctor);
      doctor._id = result.insertedId;

      res.status(201).json({
        status: "success",
        data: {
          doctor,
        },
      });
    });

    // Read all doctors
    app.get("/api/v1/doctors", async (req, res) => {
      const doctors = await doctorsCollection.find({}).toArray();

      res.status(200).json({
        status: "success",
        data: {
          doctors,
        },
      });
    });

    app.delete("/api/v1/doctors/:id", verifyJWT, async (req, res) => {
      const decondedEmail = req.decoded.email;
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };

      const query = { email: decondedEmail };
      const user = await usersCollection.findOne(query);
      const result = await doctorsCollection.deleteOne(filter);

      if (user?.role !== "admin") {
        return res.status(403).json({
          status: "fail",
          message: "forbidden access",
        });
      }

      res.status(200).json({
        status: "success",
        data: {
          result,
        },
      });
    });
  } finally {
  }
}

run().catch((error) => console.log(error));

app.get("/", (req, res) => {
  res.send("Hello from doctor's portal server");
});

// Start the server

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Doctor's portal is running on port ${port}`);
});
