const catchAsync = require("./../utils/catchAsync");
const AppError = require("./../utils/appError");
const APIFeatures = require("./../utils/apiFeatures");

exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    let filterObject = {};
    if (req.params.categoryID)
      filterObject = { category: req.params.categoryID };
    if (req.params.subcategoryID)
      filterObject["subcategory"] = req.params.subcategoryID;
    if (req.params.brandID) filterObject["brand"] = req.params.brandID;
    if (req.filterObject)
      filterObject = { ...filterObject, ...req.filterObject };

    // EXECUTE QUERY
    const features = new APIFeatures(Model.find(filterObject), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();
    const docs = await features.query;

    // SEND RESPONSE
    res.status(200).json({
      status: "success",
      requestedAt: req.requestTime,
      results: docs.length,
      data: {
        data: docs,
      },
    });
  });

exports.getOne = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let query = Model.findById(req.params.id);
    if (popOptions) query = query.populate(popOptions);

    const doc = await query;
    if (!doc) {
      return next(new AppError("No document found with this ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        date: doc,
      },
    });
  });

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const newDoc = await Model.create(req.body);
    res.status(201).json({
      status: "success",
      data: {
        tour: newDoc,
      },
    });
  });

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return next(new AppError("No document found with this ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  });

exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) {
      return next(new AppError("No document found with this ID", 404));
    }

    res.status(204).json({
      status: "success",
      data: null,
    });
  });
