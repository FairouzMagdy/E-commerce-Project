const User = require("../models/userModel");

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

exports.getAddresses = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).populate("addresses");
  res.status(200).json({
    status: "success",
    results: user.addresses.length,
    data: user.addresses,
  });
});

exports.addAddress = catchAsync(async (req, res, next) => {
  if (
    !req.body.country ||
    !req.body.city ||
    !req.body.governorate ||
    !req.body.address ||
    !req.body.postCode
  )
    return next(
      new AppError(
        "Country, city, governorate, address and post code are required",
        400
      )
    );
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $addToSet: { addresses: req.body },
    },
    { new: true }
  );
  res.status(200).json({
    status: "success",
    results: user.addresses.length,
    data: user.addresses,
  });
});

exports.deleteAddress = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $pull: { addresses: { _id: req.params.id } },
    },
    { new: true }
  );

  if (!user) {
    return next(new AppError("No address found with this ID", 404));
  }

  res.status(200).json({
    status: "success",
    results: user.addresses.length,
    data: user.addresses,
  });
});
