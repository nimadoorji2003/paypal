import express from "express";
import bodyParser from "body-parser";
import engines from "consolidate";
import fetch from "node-fetch";
import paypalRestSdk from "paypal-rest-sdk";
import { config } from "dotenv";
config();
const paypal = paypalRestSdk;

const app = express();

app.engine("ejs", engines.ejs);
app.set("views", "./views");
app.set("view engine", "ejs");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

paypal.configure({
  mode: "sandbox", //sandbox or live
  client_id:
    "AV2Tz4Cowe_y1bLmaudtXEo6FWDMVnHmIIaQNpkZd-XPIgf901I5UQnfzlE7G40T1CaloBVrJG41QOfG",
  client_secret:
    "EDAGmOVKWfkfrzuCG_z-besPVF8FkOfWbaQLoVgr6i03m-wbTi1NCCkd3ewHaROGMMWZMpa4TFbtd4PL",
});

app.get("/", (req, res) => {
  res.render("index");
});

app.post("/paypal", (req, res) => {
  const cart = req.body.cart;

  // Construct purchaseUnits array based on the cart data received from the frontend
  const purchaseUnits = cart.map((item) => {
    const totalAmount = (item.price * item.roomQuantity).toFixed(2); // Calculate total amount for the item

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

  // Construct the create payment JSON using purchaseUnits
  const create_payment_json = {
    intent: "sale",
    payer: {
      payment_method: "paypal",
    },
    redirect_urls: {
      return_url: "http://10.9.89.146:8880/success",
      cancel_url: "http://10.9.89.146:8880/cancel",
    },
    transactions: purchaseUnits.map((purchaseUnit) => {
      return {
        amount: purchaseUnit.amount,
        item_list: {
          items: purchaseUnit.items,
        },
        description: "This is the payment description.",
      };
    }),
  };

  paypal.payment.create(create_payment_json, function (error, payment) {
    if (error) {
      console.error("Error creating PayPal payment:", error);
      res.status(500).json({ error: "Failed to create PayPal payment." });
    } else {
      console.log("Create Payment Response");
      console.log(payment);
      res.redirect(
        payment.links.find((link) => link.rel === "approval_url").href
      );
    }
  });
});

app.get("/success", (req, res) => {
  const { PayerID, paymentId } = req.query;
  const cart = req.body.cart;

  // Construct purchaseUnits array based on the cart data received from the frontend
  const purchaseUnits = cart.map((item) => {
    const totalAmount = (item.price * item.roomQuantity).toFixed(2); // Calculate total amount for the item

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

  // Construct the execute payment JSON using purchaseUnits
  const execute_payment_json = {
    payer_id: PayerID,
    transactions: purchaseUnits.map((purchaseUnit) => {
      return {
        amount: purchaseUnit.amount,
        item_list: {
          items: purchaseUnit.items,
        },
      };
    }),
  };

  paypal.payment.execute(
    paymentId,
    execute_payment_json,
    function (error, payment) {
      if (error) {
        console.error("Error executing PayPal payment:", error);
        console.error("PayPal error details:", error.response.details);
        res.status(500).json({ error: "Failed to execute PayPal payment." });
      } else {
        console.log("Get Payment Response");
        console.log(JSON.stringify(payment));
        res.render("success");
      }
    }
  );
});

app.get("cancel", (req, res) => {
  res.render("cancel");
});

app.listen(8880, () => {
  console.log("Server is running");
});
