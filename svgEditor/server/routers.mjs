export default [
  {
    method: "get",
    path: "/",
    handler: (req, res) => {
      res.render("home");
    },
  },
];
