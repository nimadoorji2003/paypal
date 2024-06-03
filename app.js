import express from "express";
import bodyParser from "body-parser";
import engines from "consolidate";
import fetch from "node-fetch";
import paypalRestSdk from "paypal-rest-sdk";
import session from "express-session";
import path from "path";
import { config } from "dotenv";
config();

const paypal = paypalRestSdk;
const app = express();

app.engine("ejs", engines.ejs);
app.set("views", "./views");
app.set("view engine", "ejs");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function generateRandomString(length = 32) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const secretKey = generateRandomString();

app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

const PAYPAL_CLIENT_ID =
  "AV2Tz4Cowe_y1bLmaudtXEo6FWDMVnHmIIaQNpkZd-XPIgf901I5UQnfzlE7G40T1CaloBVrJG41QOfG";
const PAYPAL_CLIENT_SECRET =
  "EDAGmOVKWfkfrzuCG_z-besPVF8FkOfWbaQLoVgr6i03m-wbTi1NCCkd3ewHaROGMMWZMpa4TFbtd4PL";

paypal.configure({
  mode: "sandbox", //sandbox or live
  client_id: PAYPAL_CLIENT_ID,
  client_secret: PAYPAL_CLIENT_SECRET,
});

app.get("/", (req, res) => {
  res.render("index");
});

app.post("/paypal", async (req, res) => {
  try {
    const { cart } = req.body;

    req.session.cart = cart; // Store cart in session

    const create_payment_json = {
      intent: "sale",
      payer: {
        payment_method: "paypal",
      },
      redirect_urls: {
        return_url: "https://paypal-npml.onrender.com/success",
        cancel_url: "https://paypal-npml.onrender.com/cancel",
      },
      transactions: [
        {
          item_list: {
            items: cart.map((item) => ({
              name: item.name,
              price: item.price.toFixed(2),
              currency: "USD",
              quantity: item.roomQuantity,
            })),
          },
          amount: {
            currency: "USD",
            total: item.price.toFixed(2),
          },
          description: "This is the payment description.",
        },
      ],
    };

    paypal.payment.create(create_payment_json, (error, payment) => {
      if (error) {
        console.error("Failed to create payment:", error.response);
        res.status(400).json({
          error: "Failed to create payment.",
          details: error.response.details,
        });
      } else {
        const approvalUrl = payment.links.find(
          (link) => link.rel === "approval_url"
        ).href;
        console.log("Create Payment Response:", payment);
        res.json({ redirect_url: approvalUrl });
      }
    });
  } catch (error) {
    console.error("Failed to process PayPal payment:", error);
    res.status(500).json({ error: "Failed to process PayPal payment." });
  }
});

app.get("/success", async (req, res) => {
  try {
    const { PayerID, paymentId } = req.query;
    const cart = req.session.cart; // Retrieve cart from session

    if (!cart) {
      return res.status(400).send("Cart not found.");
    }

    const execute_payment_json = {
      payer_id: PayerID,
      transactions: [
        {
          amount: {
            currency: "USD",
            total: cart
              .reduce(
                (total, item) => total + item.price * item.roomQuantity,
                0
              )
              .toFixed(2),
          },
        },
      ],
    };

    paypal.payment.execute(
      paymentId,
      execute_payment_json,
      (error, payment) => {
        if (error) {
          console.error("Failed to execute payment:", error.response);
          res.status(500).send("Error processing payment.");
        } else {
          console.log("Get Payment Response:", JSON.stringify(payment));
          res.render("success");
        }
      }
    );
  } catch (error) {
    console.error("Error processing successful payment:", error);
    res.status(500).send("Error processing payment.");
  }
});

app.get("/cancel", (req, res) => {
  res.render("cancel", { message: "Payment cancelled." });
});

const port = 8880;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
