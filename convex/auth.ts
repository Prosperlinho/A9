import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params) => {
        const role =
          params.role === "rider" || params.role === "admin"
            ? params.role
            : "student";

        return {
          ...(typeof params.name === "string" ? { name: params.name } : {}),
          email: String(params.email).trim().toLowerCase(),
          ...(typeof params.phone === "string" ? { phone: params.phone } : {}),
          ...(typeof params.matricNumber === "string"
            ? { matricNumber: params.matricNumber }
            : {}),
          ...(typeof params.faculty === "string" ? { faculty: params.faculty } : {}),
          ...(typeof params.department === "string"
            ? { department: params.department }
            : {}),
          ...(typeof params.vehicle === "string" ? { vehicle: params.vehicle } : {}),
          ...(typeof params.plateNumber === "string"
            ? { plateNumber: params.plateNumber }
            : {}),
          ...(role === "rider" ? { verificationStatus: "not_verified" as const } : {}),
          role,
          walletBalance: 0,
        };
      },
    }),
  ],
});
