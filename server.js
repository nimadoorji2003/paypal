import express from "express";
import bodyParser from "body-parser";
import engines from "consolidate";
import paypal from "paypal-rest-sdk";

import fetch from "node-fetch";
import "dotenv/config";
import { config } from "dotenv";
config();

const PORT = process.env.PORT || 8880;
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
const base = "https://api-m.sandbox.paypal.com";
const app = express();

// Host static files
app.use(express.static("client/dist"));

// Parse POST params sent in body in JSON format
app.use(express.json());

app.engine("ejs", engines.ejs);
app.set("views", "./views");
app.set("view engine", "ejs");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

paypal.configure({
  mode: "sandbox", // Sandbox or live
  client_id: PAYPAL_CLIENT_ID,
  client_secret: PAYPAL_CLIENT_SECRET,
});

// Generate an OAuth 2.0 access token for authenticating with PayPal REST APIs.
const generateAccessToken = async () => {
  try {
    const auth = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
    throw error;
  }
};

// Create an order to start the transaction.
const createOrder = async (cart) => {
  try {
    const accessToken = await generateAccessToken();
    const url = `${base}/v2/checkout/orders`;

    const redirectUrls = {
      return_url: "http://localhost:8880/success",
      cancel_url: "http://localhost:8880/cancel",
    };

    const purchaseUnits = cart.map((item) => {
      const totalAmount = (item.price * item.roomQuantity).toFixed(2);

      return {
        amount: {
          currency_code: "USD",
          value: totalAmount,
          breakdown: {
            item_total: { currency_code: "USD", value: totalAmount },
          },
        },
        items: [
          {
            name: item.roomType,
            quantity: item.roomQuantity.toString(),
            unit_amount: {
              currency_code: "USD",
              value: item.price.toFixed(2),
            },
          },
        ],
      };
    });

    const payload = {
      intent: "CAPTURE",
      purchase_units: purchaseUnits,
      redirect_urls: redirectUrls,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    return handleResponse(response);
  } catch (error) {
    console.error("Failed to create order:", error);
    throw error;
  }
};

// Capture payment for the created order to complete the transaction.
const captureOrder = async (orderID) => {
  try {
    const accessToken = await generateAccessToken();
    const url = `${base}/v2/checkout/orders/${orderID}/capture`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return handleResponse(response);
  } catch (error) {
    console.error("Failed to capture order:", error);
    throw error;
  }
};

async function handleResponse(response) {
  const jsonResponse = await response.json();
  return {
    jsonResponse,
    httpStatusCode: response.status,
  };
}

app.post("/api/orders", async (req, res) => {
  try {
    const { cart } = req.body;
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});

app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to capture order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

async function getBookingDetails(paymentID) {
  try {
    const url = `https://your-booking-api.com/bookings/${paymentID}`;

    const response = await fetch(url);
    const bookingData = await response.json();

    if (!bookingData || bookingData.error) {
      throw new Error("Failed to retrieve booking details");
    }

    return bookingData;
  } catch (error) {
    console.error("Error retrieving booking details:", error);
    throw error;
  }
}

// Success route
app.get("/success", async (req, res) => {
  try {
    const paymentID = req.query.paymentId;
    const bookingDetails = await getBookingDetails(paymentID);
    res.render("success", { bookingDetails });
  } catch (error) {
    console.error("Error processing successful payment:", error);
    res.status(500).send("Error processing payment.");
  }
});

// Cancel route
app.get("/cancel", (req, res) => {
  res.render("cancel", { message: "Payment cancelled." });
});

// Test route to check server
app.get("/", (req, res) => {
  console.log("Received request to /");
  res.send("Server is running.");
});

// PayPal integration route
app.get("/paypal", (req, res) => {
  const { roomPrice, numNights, hotelName } = req.session;

  const create_payment_json = {
    intent: "sale",
    payer: {
      payment_method: "paypal",
    },
    redirect_urls: {
      return_url: "http://localhost:8880/success",
      cancel_url: "http://localhost:8880/cancel",
    },
    transactions: [
      {
        item_list: {
          items: [
            {
              name: hotelName ? `${hotelName} Stay` : "Hotel Booking",
              sku: "hotel_booking",
              price: roomPrice.toFixed(2),
              currency: "USD",
              quantity: numNights,
            },
          ],
        },
        amount: {
          currency: "USD",
          total: (roomPrice * numNights).toFixed(2),
        },
        description: "Hotel booking payment",
      },
    ],
  };

  paypal.payment.create(create_payment_json, function (error, payment) {
    if (error) {
      console.error("Error creating PayPal payment:", error);
      res.status(500).send("Error creating PayPal payment.");
    } else {
      console.log("Create Payment Response");
      console.log(payment);
      res.redirect(payment.links[1].href);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
