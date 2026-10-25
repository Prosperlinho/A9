const issuerUrl =
  process.env.CONVEX_SITE_URL ??
  process.env.SITE_URL ??
  process.env.VITE_CONVEX_SITE_URL;

if (!issuerUrl) {
  throw new Error("Missing Convex auth issuer URL. Set CONVEX_SITE_URL on the deployed Convex environment.");
}

export default {
  providers: [
    {
      domain: issuerUrl,
      applicationID: "convex",
    },
  ],
};
