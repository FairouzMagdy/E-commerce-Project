const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Product = require("../models/productModel");

exports.addToWishlist = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.body.productId);
  if (!product) {
    return next(
      new AppError("No product found with that ID, Can't add to wishlist", 404)
    );
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $addToSet: { wishlist: req.body.productId },
    },
    { new: true }
  );
  res.status(200).json({
    status: "success",
    results: user.wishlist.length,
    data: user.wishlist,
  });
});

exports.removeFromWishlist = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $pull: { wishlist: req.params.id },
    },
    { new: true }
  );
  if (!user) {
    return next(new AppError("No wishlist product found", 404));
  }
  res.status(200).json({
    status: "success",
    results: user.wishlist.length,
    data: user.wishlist,
  });
});

exports.getWishlist = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).populate("wishlist");
  res.status(200).json({
    status: "success",
    results: user.wishlist.length,
    data: user.wishlist,
  });
});
