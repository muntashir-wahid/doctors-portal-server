const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// Middlewares

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

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

    // Create a booking

    app.post("/api/v1/bookings", async (req, res) => {
      const booking = req.body;

      const query = {
        patientName: booking.patientName,
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
