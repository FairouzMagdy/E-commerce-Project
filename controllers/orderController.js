const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const handlerFactory = require("./handlerFactory");

const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const ObjectId = require("mongoose").Types.ObjectId;

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOne({
    user: req.user._id,
    _id: req.params.cartId,
  });

  if (!cart) {
    return next(
      new AppError(`There is no cart for this user with this id`, 404)
    );
  }

  if (!req.body.firstName)
    return next(new AppError("First name is required", 400));
  if (!req.body.lastName)
    return next(new AppError("Last name is required", 400));
  if (!req.body.phone) return next(new AppError("Phone is required", 400));
  let shippingAddress = {};
  if (req.body.shippingAddress) {
    shippingAddress = req.body.shippingAddress;
    if (!shippingAddress.country)
      return next(new AppError("Country is required", 400));
    if (!shippingAddress.address)
      return next(new AppError("Address is required", 400));
    if (!shippingAddress.governorate)
      return next(new AppError("Governorate is required", 400));
    if (!shippingAddress.city)
      return next(new AppError("City is required", 400));
    if (!shippingAddress.postCode)
      return next(new AppError("Post code is required", 400));
  } else {
    if (req.user.addresses.length === 0) {
      return next(
        new AppError(
          `Please provide shipping address when creating an order, or in your profile`,
          400
        )
      );
    }
    shippingAddress.address = req.user.addresses[0]._id;
  }

  const items = cart.cartItems.map((item) => {
    if (item.quantity > item.product.quantity) {
      return next(new AppError("Not enough quantity in stock", 400));
    }
    return {
      price_data: {
        unit_amount: Math.round(
          item.product.price * (1 - item.product.discount / 100) * 100
        ),
        currency: "usd",
        product_data: {
          name: item.product.name,
        },
      },
      quantity: item.quantity,
    };
  });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    success_url: `${req.protocol}://${req.get(
      "host"
    )}/api/v1/orders/redirect?status=success`,
    cancel_url: `${req.protocol}://${req.get(
      "host"
    )}/api/v1/orders/redirect?status=cancel`,
    customer_email: req.user.email,
    client_reference_id: req.params.cartId,
    line_items: items,

    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: 1000,
            currency: "usd",
          },
          display_name: "Shipping takes 5-7 days",
        },
      },
    ],
    mode: "payment",
    customer_email: req.user.email,
    client_reference_id: req.params.cartId,
    metadata: {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phone: req.body.phone,
      country: shippingAddress.country,
      address: shippingAddress.address,
      governorate: shippingAddress.governorate,
      city: shippingAddress.city,
    },
  });

  res.status(200).json({
    status: "success",
    session,
  });
});

exports.webhook = (req, res, next) => {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed")
    createOrderCheckout(event.data.object);
  res.status(200).json({ received: true });
};

const createOrderCheckout = async (session) => {
  try {
    const cart = await Cart.findById(session.client_reference_id);
    const user = (await User.findOne({ email: session.customer_email }))._id;
    const price = session.amount_total / 100 + 10;
    const { firstName, lastName, phone, country, address, governorate, city } =
      session.metadata;
    await Order.create({
      user,
      firstName,
      lastName,
      phone,
      products: cart.cartItems,
      totalPrice: price,
      shippingAddress: {
        country,
        address,
        governorate,
        city,
      },
      paymentStatus: "Paid",
      paymentMethodType: "card",
      shippingPrice: 10,
    });
    const updatePromises = await Promise.all(
      cart.cartItems.map(async (item) => {
        return await Product.findByIdAndUpdate(
          item.product._id,
          {
            $inc: { quantity: -item.quantity, sold: +item.quantity },
          },
          { new: true }
        );
      })
    );
    // console.log(updatePromises);
    await Cart.findByIdAndDelete(session.client_reference_id);
  } catch (err) {
    console.log(err);
  }
};

exports.getOrder = catchAsync(async (req, res, next) => {
  let filter = {};
  if (req.user.role === "user") filter = { user: req.user._id };
  const order = await Order.findOne({ _id: req.params.id, ...filter });
  if (req.user.role === "user" && !order)
    return next(new AppError("You don't have an order with this id", 404));
  if (req.user.role === "admin" && !order)
    return next(new AppError("There is no order with this id", 404));

  res.status(200).json({
    status: "success",
    order,
  });
});

exports.filterOrders = (req, res, next) => {
  if (req.user.role === "user") {
    req.filterObject = { user: req.user._id };
  }
  next();
};

exports.filterBody = (req, res, next) => {
  const filteredBody = {};
  if (req.body.hasOwnProperty("status")) {
    filteredBody.status = req.body.status;
  }
  if (req.body.hasOwnProperty("paymentStatus")) {
    filteredBody.paymentStatus = req.body.paymentStatus;
  }
  if (req.body.hasOwnProperty("paymentMethodType")) {
    filteredBody.paymentMethodType = req.body.paymentMethodType;
  }
  req.body = filteredBody;
  next();
};

exports.redirectWebhook = (req, res, next) => {
  if (req.query.status === "success") {
    res.redirect("https://harri-delta.vercel.app/orders");
  } else {
    res.redirect("https://harri-delta.vercel.app/orders");
  }
};

exports.getAllOrders = handlerFactory.getAll(Order);
exports.deleteOrder = handlerFactory.deleteOne(Order);
exports.updateOrder = handlerFactory.updateOne(Order);
