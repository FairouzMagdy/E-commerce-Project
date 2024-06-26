const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const Product = require("../models/productModel");
const Coupon = require("../models/couponModel");
const Cart = require("../models/cartModel");

const calcTotalCartPrice = (cart) => {
  let totalPrice = 0;
  let totalPriceAfterDiscount = 0;
  cart.cartItems.forEach((item) => {
    totalPrice += item.itemPrice;
    totalPriceAfterDiscount += item.itemPriceAfterDiscount;
  });
  cart.totalCartPrice = totalPrice;

  cart.totalPriceAfterDiscount = totalPriceAfterDiscount;
  if (cart.couponed === true) {
    cart.totalPriceAfterDiscount =
      totalPriceAfterDiscount * (1 - cart.coupon.discount / 100);
  }
  cart.totalPriceAfterDiscount =
    Math.round(cart.totalPriceAfterDiscount * 100) / 100;
  return totalPrice;
};

exports.addProductToCart = catchAsync(async (req, res, next) => {
  const quantity = req.body.quantity || 1;

  // product
  const product = await Product.findById(req.body.productId);
  if (!product) {
    return next(
      new AppError("No product found with this ID, Couldn't add to cart", 404)
    );
  }

  // cart
  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    // create cart
    cart = await Cart.create({
      user: req.user._id,
      cartItems: [
        {
          product: req.body.productId,
          quantity,
          itemPrice: product.price * quantity,
          itemPriceAfterDiscount:
            Math.round(
              product.price * quantity * (1 - product.discount / 100) * 100
            ) / 100,
        },
      ],
    });
  } else {
    // product exist in cart, update product quantity
    const productIndex = cart.cartItems.findIndex(
      (item) => item.product._id.toString() === req.body.productId
    );

    if (productIndex > -1) {
      cart.cartItems[productIndex].quantity += quantity;
      cart.cartItems[productIndex].itemPrice += product.price * quantity;

      cart.cartItems[productIndex].itemPriceAfterDiscount +=
        Math.round(
          product.price * quantity * (1 - product.discount / 100) * 100
        ) / 100;
    } else {
      // product not exist in cart,  push product to cartItems array
      cart.cartItems.push({
        product: req.body.productId,
        quantity,
        itemPrice: product.price * quantity,
        itemPriceAfterDiscount:
          Math.round(
            product.price * (1 - product.discount / 100) * quantity * 100
          ) / 100,
      });
    }
  }

  // Calculate total cart price
  calcTotalCartPrice(cart);
  await cart.save();

  res.status(200).json({
    status: "success",
    numOfCartItems: cart.cartItems.length,
    data: { cart },
  });
});

exports.getLoggedUserCart = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    return next(new AppError(`There is no cart for this user`, 404));
  }

  res.status(200).json({
    status: "success",
    numOfCartItems: cart.cartItems.length,
    data: { cart },
  });
});

exports.removeSpecificCartItem = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOneAndUpdate(
    { user: req.user._id },
    {
      $pull: { cartItems: { _id: req.params.itemId } },
    },
    { new: true }
  );
  if (!cart) {
    return next(new AppError(`There is no cart for this user`, 404));
  }

  calcTotalCartPrice(cart);
  cart.save();

  res.status(200).json({
    status: "success",
    numOfCartItems: cart.cartItems.length,
    data: cart,
  });
});

exports.clearCart = catchAsync(async (req, res, next) => {
  await Cart.findOneAndDelete({ user: req.user._id });
  res.status(204).send();
});

exports.updateCartItemQuantity = catchAsync(async (req, res, next) => {
  const { quantity } = req.body;
  if (quantity < 1 || !quantity) {
    return next(new AppError(`Please enter a valid quantity`, 400));
  }

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new AppError(`There is no cart for current user`, 404));
  }

  const itemIndex = cart.cartItems.findIndex(
    (item) => item._id.toString() === req.params.itemId
  );
  if (itemIndex > -1) {
    const cartItem = cart.cartItems[itemIndex];
    cartItem.quantity = quantity;
    cart.cartItems[itemIndex] = cartItem;
    cart.cartItems[itemIndex].itemPrice =
      cart.cartItems[itemIndex].product.price * quantity;
    cart.cartItems[itemIndex].itemPriceAfterDiscount =
      (cart.cartItems[itemIndex].product.price *
        Math.round(
          (1 - cart.cartItems[itemIndex].product.discount / 100) *
            quantity *
            100
        )) /
      100;
  } else {
    return next(new AppError(`There is no cart item with this id`, 404));
  }

  calcTotalCartPrice(cart);

  await cart.save();

  res.status(200).json({
    status: "success",
    numOfCartItems: cart.cartItems.length,
    data: cart,
  });
});

exports.applyCouponDiscount = catchAsync(async (req, res, next) => {
  const couponCode = req.body.couponCode;
  const coupon = await Coupon.findOne({
    couponCode,
    expiryDate: { $gte: new Date() },
  });

  if (!coupon) {
    return next(new AppError(`No valid coupon with this code`, 400));
  }

  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    return next(new AppError(`There is no cart for current user`, 404));
  }
  if (cart.couponed) {
    return next(new AppError(`You can only use one coupon per cart`, 400));
  }
  cart.totalPriceAfterDiscount =
    Math.round(
      cart.totalPriceAfterDiscount * (1 - coupon.discount / 100) * 100
    ) / 100;

  cart.couponed = true;
  cart.coupon = coupon._id;
  cart = await cart.save();
  res.status(200).json({
    status: "success",
    message: "Coupon applied",
    data: cart,
  });
});
