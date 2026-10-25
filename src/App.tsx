
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, FormEvent, ReactNode } from "react";
import { useAction, useConvexConnectionState, useMutation, useQueries, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  ArrowRight,
  ArrowDownToLine,
  Bike,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Bell,
  Eye,
  EyeOff,
  FileText,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Star,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { BrandMark } from "./BrandMark";

type Role = "student" | "rider" | "admin";
type AuthView = "signIn" | "join" | "registerStudent" | "registerRider" | null;
type JoinRole = "student" | "rider";
type Status =
  | "requested"
  | "negotiating"
  | "offer_made"
  | "accepted"
  | "rider_arriving"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled"
  | "disputed"
  | "expired";
type Page = "dashboard" | "booking" | "wallet" | "settings" | "help" | "verification";
type VerificationStatus = "not_verified" | "under_review" | "approved" | "rejected";
type LocationGroup = "backgate" | "frontgate" | "school-area";
type Location = {
  _id?: Id<"locations">;
  slug?: string;
  name: string;
  group?: LocationGroup;
  groupLabel?: string;
  detail?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  state?: string;
};
type LocationRecord = Location;
const locationGroups: Array<{ id: LocationGroup; label: string; slugs: string[] }> = [
  { id: "backgate", label: "BACKGATE", slugs: ["greenhouse", "prestige", "chikamso", "let-love-lead", "divine-lodge", "nwabuking", "jubilation-lodge"] },
  { id: "frontgate", label: "FRONTGATE", slugs: ["excellent-lodge", "emmanuel-god-with-us", "lakass", "amazing-grace", "gas-station", "up-jesus"] },
  { id: "school-area", label: "SCHOOL AREA", slugs: ["legal-unit", "convo", "physical-science", "education", "humanities", "c-block", "new-girls-hostel", "old-girls-hostel", "boys-hostel", "theatre-art", "school-clinic", "bursary"] },
];
const locationLabel = (location: Pick<Location, "groupLabel" | "name" | "city" | "state"> | null | undefined) =>
  location ? location.groupLabel
    ? `${location.groupLabel} · ${location.name}`
    : [location.name, location.city, location.state].filter(Boolean).join(", ")
    : "";
const locationIdentity = (location: Location) =>
  location._id ?? location.slug ?? `${location.name}|${location.city ?? ""}|${location.state ?? ""}`.toLowerCase();
const rideLocationInput = (location: Location) => ({
  name: location.name,
  city: location.city ?? "",
  state: location.state ?? "",
  ...((location.latitude ?? location.lat) !== undefined ? { lat: location.latitude ?? location.lat } : {}),
  ...((location.longitude ?? location.lng) !== undefined ? { lng: location.longitude ?? location.lng } : {}),
});
type Ride = {
  _id: Id<"rides">;
  userId?: Id<"users">;
  pickupLocationId?: Id<"locations">;
  destinationLocationId?: Id<"locations">;
  pickupLabel?: string;
  destinationLabel?: string;
  pickupCity?: string;
  pickupState?: string;
  destinationCity?: string;
  destinationState?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  fare?: number;
  offeredFare?: number;
  agreedFare?: number;
  proposedPrice?: number;
  proposedBy?: Id<"users">;
  negotiationStartedAt?: number;
  status: Status;
  requestStatus?: "searching" | "offers_available" | "booked" | "cancelled" | "expired";
  requestedAt: number;
  expiresAt: number;
  serverNow: number;
  ratingSubmittedAt?: number;
  acceptedAt?: number;
  cancellationReason?: string;
  completedAt?: number;
  riderId?: Id<"users">;
  paymentStatus?: "pending" | "paid" | "failed" | "cancelled" | "processing";
  paymentStage?: "unpaid" | "paid_held" | "awaiting_completion" | "eligible_for_rider" | "pending_payout" | "paid_to_rider" | "refunded" | "disputed";
  paymentAmount?: number;
  studentName?: string;
  completionRequestedAt?: number;
  completionConfirmedAt?: number;
  completionConfirmedBy?: Id<"users">;
  disputeReportedAt?: number;
  disputeReportedBy?: Id<"users">;
  disputeReason?: string;
};
type WalletFundingResult = { fundingId: Id<"walletFundingRequests">; authorizationUrl: string; status: string };
const formatNaira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;
const formatKobo = (amount: number) => `₦${(amount / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INACTIVITY_TIMEOUT_MS = 900_000;
const formatNigerianDate = (timestamp?: number) => {
  if (!timestamp) return "Not available";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
};
const formatNigerianTime = (timestamp?: number) => {
  if (!timestamp) return "Not available";
  return new Intl.DateTimeFormat("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
};
const formatNigerianDateTime = (timestamp?: number) => {
  if (!timestamp) return "Not available";
  return `${formatNigerianDate(timestamp)} · ${formatNigerianTime(timestamp)}`;
};
const statusLabels: Record<Status, string> = {
  requested: "Waiting for Rider",
  negotiating: "Negotiating fare",
  offer_made: "Price offer available",
  accepted: "Rider accepted",
  rider_arriving: "Rider is arriving",
  in_progress: "Ride in progress",
  awaiting_confirmation: "Awaiting your confirmation",
  completed: "Ride completed",
  cancelled: "Ride cancelled",
  disputed: "Ride issue reported",
  expired: "Ride request expired",
};
const rideStatuses: Status[] = [
  "requested",
  "negotiating",
  "offer_made",
  "accepted",
  "rider_arriving",
  "in_progress",
  "awaiting_confirmation",
  "completed",
  "cancelled",
  "disputed",
  "expired",
];
const normalizeRideStatus = (status: Status): Status => {
  switch (status.toLowerCase()) {
    case "requested": return "requested";
    case "negotiating": return "negotiating";
    case "offer_made": return "offer_made";
    case "accepted": return "accepted";
    case "rider_arriving": return "rider_arriving";
    case "in_progress": return "in_progress";
    case "awaiting_confirmation": return "awaiting_confirmation";
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "disputed": return "disputed";
    case "expired": return "expired";
    default: return status;
  }
};
export const normalizeDashboardRides = (value: unknown): Ride[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Ride[] => {
    if (typeof item !== "object" || item === null) return [];
    const ride = item as Record<string, unknown>;
    if (
      typeof ride._id !== "string" ||
      typeof ride.status !== "string" ||
      !rideStatuses.includes(ride.status as Status)
    ) return [];
    const requestedAt = typeof ride.requestedAt === "number" && Number.isFinite(ride.requestedAt)
      ? ride.requestedAt
      : 0;
    const optionalNumber = (key: string) => {
      const field = ride[key];
      return typeof field === "number" && Number.isFinite(field) ? field : undefined;
    };
    const optionalString = (key: string) =>
      typeof ride[key] === "string" ? ride[key] as string : undefined;
    return [{
      _id: ride._id as Id<"rides">,
      userId: optionalString("userId") as Id<"users"> | undefined,
      riderId: optionalString("riderId") as Id<"users"> | undefined,
      pickupLocationId: optionalString("pickupLocationId") as Id<"locations"> | undefined,
      destinationLocationId: optionalString("destinationLocationId") as Id<"locations"> | undefined,
      pickupLabel: optionalString("pickupLabel")?.trim() || "Pickup unavailable",
      destinationLabel: optionalString("destinationLabel")?.trim() || "Destination unavailable",
      pickupCity: optionalString("pickupCity"),
      pickupState: optionalString("pickupState"),
      destinationCity: optionalString("destinationCity"),
      destinationState: optionalString("destinationState"),
      pickupLatitude: optionalNumber("pickupLatitude"),
      pickupLongitude: optionalNumber("pickupLongitude"),
      destinationLatitude: optionalNumber("destinationLatitude"),
      destinationLongitude: optionalNumber("destinationLongitude"),
      fare: optionalNumber("fare"),
      offeredFare: optionalNumber("offeredFare"),
      agreedFare: optionalNumber("agreedFare"),
      proposedPrice: optionalNumber("proposedPrice"),
      proposedBy: optionalString("proposedBy") as Id<"users"> | undefined,
      negotiationStartedAt: optionalNumber("negotiationStartedAt"),
      status: normalizeRideStatus(ride.status as Status),
      requestStatus: ["searching", "offers_available", "booked", "cancelled", "expired"].includes(String(ride.requestStatus))
        ? ride.requestStatus as Ride["requestStatus"]
        : undefined,
      requestedAt,
      expiresAt: optionalNumber("expiresAt") ?? requestedAt,
      serverNow: optionalNumber("serverNow") ?? Date.now(),
      ratingSubmittedAt: optionalNumber("ratingSubmittedAt"),
      acceptedAt: optionalNumber("acceptedAt"),
      cancellationReason: optionalString("cancellationReason"),
      completedAt: optionalNumber("completedAt"),
      paymentStatus: ["pending", "paid", "failed", "cancelled", "processing"].includes(String(ride.paymentStatus))
        ? ride.paymentStatus as Ride["paymentStatus"]
        : undefined,
      paymentStage: ["unpaid", "paid_held", "awaiting_completion", "eligible_for_rider", "pending_payout", "paid_to_rider", "refunded", "disputed"].includes(String(ride.paymentStage))
        ? ride.paymentStage as Ride["paymentStage"]
        : undefined,
      paymentAmount: optionalNumber("paymentAmount"),
      studentName: optionalString("studentName"),
      completionRequestedAt: optionalNumber("completionRequestedAt"),
      completionConfirmedAt: optionalNumber("completionConfirmedAt"),
      completionConfirmedBy: optionalString("completionConfirmedBy") as Id<"users"> | undefined,
      disputeReportedAt: optionalNumber("disputeReportedAt"),
      disputeReportedBy: optionalString("disputeReportedBy") as Id<"users"> | undefined,
      disputeReason: optionalString("disputeReason"),
    }];
  });
};

type DashboardWalletTransaction = {
  _id: string;
  amount: number;
  description: string;
  createdAt: number;
  type: string;
  status?: string;
};
type DashboardWallet = {
  balance: number;
  reserved: number;
  transactions: DashboardWalletTransaction[];
};
export function normalizeDashboardWallet(value: unknown): DashboardWallet {
  if (typeof value !== "object" || value === null) {
    return { balance: 0, reserved: 0, transactions: [] };
  }
  const wallet = value as Record<string, unknown>;
  const transactions: DashboardWalletTransaction[] = Array.isArray(wallet.transactions)
    ? wallet.transactions.flatMap((item): DashboardWalletTransaction[] => {
        if (typeof item !== "object" || item === null) return [];
        const transaction = item as Record<string, unknown>;
        if (
          typeof transaction._id !== "string" ||
          typeof transaction.amount !== "number" ||
          !Number.isFinite(transaction.amount) ||
          typeof transaction.description !== "string" ||
          typeof transaction.createdAt !== "number" ||
          !Number.isFinite(transaction.createdAt) ||
          typeof transaction.type !== "string"
        ) return [];
        return [{
          _id: transaction._id,
          amount: transaction.amount,
          description: transaction.description,
          createdAt: transaction.createdAt,
          type: transaction.type,
          ...(typeof transaction.status === "string" ? { status: transaction.status } : {}),
        }];
      })
    : [];
  return {
    balance: typeof wallet.balance === "number" && Number.isFinite(wallet.balance) ? wallet.balance : 0,
    reserved: typeof wallet.reserved === "number" && Number.isFinite(wallet.reserved) ? wallet.reserved : 0,
    transactions,
  };
}
const rideStatusLabel = (ride: Pick<Ride, "status" | "cancellationReason">) =>
  ride.cancellationReason === "rider_arrival_timeout"
    ? "Cancelled · Rider arrival timeout"
    : statusLabels[normalizeRideStatus(ride.status)] ?? "Ride status unavailable";

function isA9AccountProfile(value: unknown): value is {
  _id: Id<"users">;
  role: Role;
  walletBalance: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile._id === "string" &&
    (profile.role === "student" || profile.role === "rider" || profile.role === "admin") &&
    typeof profile.walletBalance === "number" &&
    Number.isFinite(profile.walletBalance)
  );
}

class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("A9 dashboard failed to render", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <div className="loading-screen" role="alert">
            <BrandMark tone="light" size={48} />
            <h1>We couldn&apos;t load your dashboard</h1>
            <p>
              A9 could not display your account data. Check your connection and
              try again. If this continues, contact A9 support.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [authMode, setAuthMode] = useState<AuthView>(null);
  const [error, setError] = useState("");
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: ReturnType<typeof setTimeout>;
    let lastActivityAt = Date.now();
    let expired = false;
    const expireSession = () => {
      if (expired) return;
      expired = true;
      clearTimeout(timer);
      setAuthMode("signIn");
      setError("Your session expired due to inactivity. Please sign in again.");
      void signOutRef.current().catch(() => {});
    };
    const resetTimer = () => {
      if (expired) return;
      lastActivityAt = Date.now();
      clearTimeout(timer);
      timer = setTimeout(expireSession, INACTIVITY_TIMEOUT_MS);
    };
    const checkExpiryOnResume = () => {
      if (document.visibilityState === "visible" && Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS) {
        expireSession();
      }
    };

    const activityEvents = ["pointermove", "pointerdown", "click", "keydown", "scroll", "touchstart"] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    window.addEventListener("popstate", resetTimer);
    window.addEventListener("hashchange", resetTimer);
    document.addEventListener("visibilitychange", checkExpiryOnResume);
    resetTimer();

    return () => {
      clearTimeout(timer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, resetTimer);
      }
      window.removeEventListener("popstate", resetTimer);
      window.removeEventListener("hashchange", resetTimer);
      document.removeEventListener("visibilitychange", checkExpiryOnResume);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) setError("");
  }, [isAuthenticated]);

  if (isLoading) return <Loading text="Connecting to A9 securely..." />;
  if (!isAuthenticated)
    return (
      <Auth
        mode={authMode}
        setMode={setAuthMode}
        error={error}
        setError={setError}
        signIn={signIn}
      />
    );
  return (
    <DashboardErrorBoundary>
      <AccountLoader signOut={signOut} />
    </DashboardErrorBoundary>
  );
}

function AccountLoader({ signOut }: { signOut: () => Promise<unknown> }) {
  const connectionState = useConvexConnectionState();
  const ensureCurrentProfile = useMutation(api.users.ensureCurrentProfile);
  const accountQueries = useMemo(() => ({
    account: { query: api.users.current, args: {} },
  }), []);
  const account = useQueries(accountQueries).account;
  const [profileBootstrapFailed, setProfileBootstrapFailed] = useState(false);
  const [profileBootstrapAttempt, setProfileBootstrapAttempt] = useState(0);
  const profileBootstrapStarted = useRef(false);
  const connectionFailed =
    account === undefined &&
    !connectionState.isWebSocketConnected &&
    connectionState.connectionRetries > 0;

  useEffect(() => {
    if (
      account !== null ||
      profileBootstrapStarted.current ||
      account === undefined ||
      account instanceof Error ||
      connectionFailed
    ) return;
    profileBootstrapStarted.current = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void ensureCurrentProfile().then((initialized) => {
      if (!initialized) {
        retryTimer = setTimeout(() => {
          profileBootstrapStarted.current = false;
          setProfileBootstrapAttempt((attempt) => attempt + 1);
        }, 1000);
      }
    }).catch((error) => {
        console.error("Failed to initialize the signed-in A9 profile", error);
        setProfileBootstrapFailed(true);
      });
    return () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [account, connectionFailed, ensureCurrentProfile, profileBootstrapAttempt]);

  if (account === undefined && !connectionFailed) {
    return <Loading text="Loading your account..." />;
  }
  if (account === null && !profileBootstrapFailed) {
    return <Loading text="Setting up your account..." />;
  }
  if (
    account instanceof Error ||
    (account === null && profileBootstrapFailed) ||
    connectionFailed ||
    (account !== undefined && !isA9AccountProfile(account))
  ) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <BrandMark tone="light" size={48} />
          <h1>We couldn&apos;t load your A9 account</h1>
          <p>
            Your sign-in is active, but A9 could not load a valid account
            profile. Check your connection and try again. If this continues,
            sign out and contact A9 support.
          </p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button className="secondary-button" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <AuthenticatedApp account={account} signOut={signOut} />;
}

function Auth({
  mode,
  setMode,
  error,
  setError,
  signIn,
}: {
  mode: AuthView;
  setMode: (mode: AuthView) => void;
  error: string;
  setError: (value: string) => void;
  signIn: (
    provider: string,
    params: Record<string, string>,
  ) => Promise<unknown>;
}) {
  const [joinRole, setJoinRole] = useState<JoinRole | null>(null);
  const openJoin = (role: JoinRole | null = null) => {
    setJoinRole(role);
    setMode("join");
  };
  return (
    <div className="auth-shell">
      <header className="landing-nav">
        <button className="landing-brand" onClick={() => setMode(null)}>
          <BrandMark tone="dark" wordmark="A9 mobility" />
        </button>
        <div className="landing-nav-meta">
          <span>Abakaliki</span>
          <span className="landing-nav-dot" />
          <span>Ebonyi, Nigeria</span>
        </div>
        <button className="landing-signin" onClick={() => setMode("signIn")}>
          Sign in
        </button>
      </header>
      <main className="landing-main">
        <section className="landing-copy">
          <div className="landing-kicker"><span className="landing-kicker-line" /> LOCAL MOBILITY / EBONYI</div>
          <h1>Move through your day with <em>A9.</em></h1>
          <p className="landing-lede">Book a reliable local ride or join the A9 rider network for convenient trips around Abakaliki and nearby areas.</p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => openJoin()}>Get started <ArrowRight size={18} /></button>
            <button className="landing-secondary" onClick={() => openJoin("rider")}>Become a rider <Bike size={17} /></button>
          </div>
          <div className="landing-trust"><ShieldCheck size={17} /><span>Local rides, made simple</span><span className="landing-trust-rule" /><span>Serving Ebonyi State</span></div>
        </section>
        <section className="landing-scene" aria-label="A9 local ride network preview">
          <div className="landing-grid" />
          <div className="landing-glow landing-glow-one" /><div className="landing-glow landing-glow-two" />
          <div className="landing-route route-a"><span /><span /><span /></div>
          <div className="landing-route route-b"><span /><span /><span /></div>
          <div className="landing-campus-card"><span className="landing-card-label">LIVE RIDE NETWORK</span><strong>Move with confidence.</strong><span>One connected ride community.</span><div className="landing-card-stats"><span><b>01</b> pickup</span><span><b>02</b> drop-off</span><span><b>24/7</b> local</span></div></div>
          <div className="landing-map-pin pin-campus"><MapPin size={16} /><span>A9 service area</span></div>
          <div className="landing-map-pin pin-city"><MapPin size={16} /><span>Abakaliki</span></div>
          <div className="landing-bike"><Bike size={112} strokeWidth={1.05} /><div className="landing-bike-ring" /></div>
          <div className="landing-coordinate">06°19'30"N<br />08°06'49"E</div>
        </section>
      </main>
      <div className="landing-bottom"><span>LOCAL RIDES</span><span>TRUSTED RIDERS</span><span>LIVE STATUS</span><span>LOCAL KNOWLEDGE</span></div>
      {mode && (
        <div className="landing-form-shell">
          {mode === "signIn" ? (
            <SignInForm
              error={error}
              setError={setError}
              signIn={signIn}
              onBack={() => setMode(null)}
              onJoin={() => openJoin()}
            />
          ) : mode === "join" ? (
            <JoinA9
              selected={joinRole}
              onSelect={setJoinRole}
              onBack={() => setMode(null)}
              onSignIn={() => setMode("signIn")}
              onContinue={() => {
                if (joinRole === "student") setMode("registerStudent");
                if (joinRole === "rider") setMode("registerRider");
              }}
            />
          ) : (
            <RegisterPath
              role={mode === "registerRider" ? "rider" : "student"}
              onBack={() => setMode("join")}
              onSignIn={() => setMode("signIn")}
              signIn={signIn}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AuthSwitch({
  prompt,
  action,
  onClick,
}: {
  prompt: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <p className="auth-switch">
      {prompt}{" "}
      <button className="auth-switch-link" type="button" onClick={onClick}>
        {action}
      </button>
    </p>
  );
}

function JoinA9({
  selected,
  onSelect,
  onBack,
  onSignIn,
  onContinue,
}: {
  selected: JoinRole | null;
  onSelect: (role: JoinRole) => void;
  onBack: () => void;
  onSignIn: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="auth-form join-form">
      <button className="text-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="auth-form-brand">
        <BrandMark tone="dark" />
      </div>
      <span className="eyebrow">Join A9</span>
      <h2>Choose how you’ll use A9</h2>
      <p className="join-lede">
        Choose how you want to use A9. Book rides as a customer or register as a rider.
      </p>
      <div className="role-cards" role="radiogroup" aria-label="Choose how you’ll use A9">
        <button
          type="button"
          role="radio"
          aria-checked={selected === "student"}
          className={selected === "student" ? "role-card selected" : "role-card"}
          onClick={() => onSelect("student")}
        >
          <span className="role-card-kicker">CUSTOMER</span>
          <strong>Ride with A9</strong>
          <span>
            Create an account to book local rides and keep your trips in one place.
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={selected === "rider"}
          className={selected === "rider" ? "role-card selected" : "role-card"}
          onClick={() => onSelect("rider")}
        >
          <span className="role-card-kicker">RIDER</span>
          <strong>Register as a Rider</strong>
          <span>
            Offer local trips through A9 and manage incoming ride requests.
          </span>
        </button>
      </div>
      <button
        className="join-continue"
        type="button"
        disabled={!selected}
        onClick={onContinue}
      >
        Continue <ArrowRight size={18} />
      </button>
      <AuthSwitch
        prompt="Already have an account?"
        action="Sign in"
        onClick={onSignIn}
      />
    </div>
  );
}

function RegisterPath({
  role,
  onBack,
  onSignIn,
  signIn,
}: {
  role: JoinRole;
  onBack: () => void;
  onSignIn: () => void;
  signIn: (
    provider: string,
    params: Record<string, string>,
  ) => Promise<unknown>;
}) {
  const isStudent = role === "student";
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  if (!isStudent) {
    return <RiderRegistrationForm onBack={onBack} onSignIn={onSignIn} signIn={signIn} />;
  }

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/[\s()-]/g, "");
    if (Object.values(form).some((value) => !value.trim())) {
      setError("Complete every field to create your A9 account.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!/^(?:\+234|0)[789]\d{9}$/.test(phone)) {
      setError("Enter a valid Nigerian phone number, such as 08012345678.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password)) {
      setError("Password must be 8+ characters with uppercase, lowercase, and a number.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await signIn("password", {
        flow: "signUp",
        name: form.name.trim(),
        email,
        phone,
        password: form.password,
        role: "student",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not create your account.");
      setIsSubmitting(false);
    }
  };

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
    type = "text",
  ) => {
    const visible = key === "password" ? passwordVisible : confirmPasswordVisible;
    const setVisible = key === "password" ? setPasswordVisible : setConfirmPasswordVisible;
    return (
      <label className="registration-field">
        <span>{label}</span>
        {type === "password" ? (
          <span className="password-input-wrap">
            <input
              required
              type={visible ? "text" : "password"}
              value={form[key]}
              placeholder={placeholder}
              onChange={(event) => update(key, event.target.value)}
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
              aria-pressed={visible}
              onClick={() => setVisible((current) => !current)}
            >
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        ) : (
          <input
            required
            type={type}
            value={form[key]}
            placeholder={placeholder}
            onChange={(event) => update(key, event.target.value)}
          />
        )}
      </label>
    );
  };

  return (
    <form className="auth-form register-form register-form--student" onSubmit={submit}>
      <button className="text-button" type="button" onClick={onBack}>
        Change role
      </button>
      <div className="auth-form-brand">
        <BrandMark tone="dark" />
      </div>
      <span className="eyebrow">Customer registration</span>
      <h2>Create your A9 account</h2>
      <p className="join-lede">
        Set up your account to book local rides and keep your trips in one place.
      </p>
      <div className="registration-fields">
        {field("name", "Full name", "e.g. Ada Okafor")}
        {field("email", "Email address", "you@example.com", "email")}
        {field("phone", "Phone number", "08012345678", "tel")}
        {field("password", "Password", "8+ characters, uppercase, lowercase, number", "password")}
        {field("confirmPassword", "Confirm password", "Re-enter your password", "password")}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating your account..." : "Create account"} <ArrowRight size={18} />
      </button>
      <AuthSwitch
        prompt="Already have an account?"
        action="Sign in"
        onClick={onSignIn}
      />
    </form>
  );
}

function RiderRegistrationForm({
  onBack,
  onSignIn,
  signIn,
}: {
  onBack: () => void;
  onSignIn: () => void;
  signIn: (
    provider: string,
    params: Record<string, string>,
  ) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    vehicle: "",
    plateNumber: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/[\s()-]/g, "");
    const plateNumber = form.plateNumber.trim().toUpperCase();
    if (Object.values(form).some((value) => !value.trim())) {
      setError("Complete every field to create your rider account.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!/^(?:\+234|0)[789]\d{9}$/.test(phone)) {
      setError("Enter a valid Nigerian phone number, such as 08012345678.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password)) {
      setError("Password must be 8+ characters with uppercase, lowercase, and a number.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!/^[A-Z0-9\s/-]{4,15}$/.test(plateNumber)) {
      setError("Enter a valid motorcycle plate number.");
      return;
    }
    setIsSubmitting(true);
    try {
      await signIn("password", {
        flow: "signUp",
        name: form.name.trim(),
        email,
        phone,
        password: form.password,
        vehicle: form.vehicle.trim(),
        plateNumber,
        role: "rider",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not create your rider account.");
      setIsSubmitting(false);
    }
  };

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
    type = "text",
  ) => {
    const visible = key === "password" ? passwordVisible : confirmPasswordVisible;
    const setVisible = key === "password" ? setPasswordVisible : setConfirmPasswordVisible;
    return (
      <label className="registration-field">
        <span>{label}</span>
        {type === "password" ? (
          <span className="password-input-wrap">
            <input
              required
              type={visible ? "text" : "password"}
              value={form[key]}
              placeholder={placeholder}
              onChange={(event) => update(key, event.target.value)}
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
              aria-pressed={visible}
              onClick={() => setVisible((current) => !current)}
            >
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        ) : (
          <input
            required
            type={type}
            value={form[key]}
            placeholder={placeholder}
            onChange={(event) => update(key, event.target.value)}
          />
        )}
      </label>
    );
  };

  return (
    <form className="auth-form register-form register-form--rider" onSubmit={submit}>
      <button className="text-button" type="button" onClick={onBack}>
        Change role
      </button>
      <div className="auth-form-brand">
        <BrandMark tone="dark" />
      </div>
      <span className="eyebrow">Rider registration</span>
      <h2>Become an A9 Rider</h2>
      <p className="join-lede">
        Share safe, reliable motorcycle trips with customers across the A9 service area. Your
        verification details are kept private and used only for platform review.
      </p>
      <div className="registration-section-heading">
        <span className="role-card-kicker">PERSONAL INFORMATION</span>
      </div>
      <div className="registration-fields">
        {field("name", "Full name", "e.g. Chinedu Okafor")}
        {field("email", "Email address", "you@example.com", "email")}
        {field("phone", "Nigerian phone number", "08012345678", "tel")}
        {field("password", "Password", "8+ characters, uppercase, lowercase, number", "password")}
        {field("confirmPassword", "Confirm password", "Re-enter your password", "password")}
      </div>
      <div className="registration-section-heading">
        <span className="role-card-kicker">RIDER INFORMATION</span>
      </div>
      <div className="registration-fields">
        {field("vehicle", "Motorcycle / bike brand or model", "e.g. Honda Ace 125")}
        {field("plateNumber", "Motorcycle plate number", "e.g. ABC-123-XY")}
      </div>
      <p className="registration-privacy">You can complete identity verification after entering the A9 platform.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating rider account..." : "Create rider account"} <ArrowRight size={18} />
      </button>
      <AuthSwitch prompt="Already have an account?" action="Sign in" onClick={onSignIn} />
    </form>
  );
}

function SignInForm({
  error,
  setError,
  signIn,
  onBack,
  onJoin,
}: {
  error: string;
  setError: (value: string) => void;
  signIn: (
    provider: string,
    params: Record<string, string>,
  ) => Promise<unknown>;
  onBack: () => void;
  onJoin: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    try {
      await signIn("password", {
        flow: "signIn",
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("InvalidAccountId") || message.includes("Invalid password")
          ? "Email or password is incorrect."
          : message || "Authentication failed.",
      );
      setIsSubmitting(false);
    }
  };
  const requestReset = async () => {
    setResetMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setResetMessage("Enter the email address used for your A9 account.");
      return;
    }
    try {
      await signIn("password", {
        flow: "reset",
        email: resetEmail.trim().toLowerCase(),
      });
      setResetMessage("Check your email for the password reset instructions.");
    } catch (caught) {
      setResetMessage(
        caught instanceof Error && caught.message.includes("not enabled")
          ? "Password reset is not configured yet. Add a reset email provider to convex/auth.ts before enabling this flow."
          : caught instanceof Error
            ? caught.message
            : "Password reset could not be requested.",
      );
    }
  };
  return (
    <form className="auth-form" onSubmit={submit}>
      <button className="text-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="auth-form-brand">
        <BrandMark tone="dark" />
      </div>
      <span className="eyebrow">Welcome back</span>
      <h2>Sign in to A9.</h2>
      <label className="signin-field">
        <span>Email address</span>
        <input
          required
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="signin-field">
        <span>Password</span>
        <span className="password-input-wrap">
          <input
            required
            minLength={8}
            type={showPassword ? "text" : "password"}
            placeholder="Your A9 password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>
      <button className="forgot-password" type="button" onClick={() => setForgotOpen((current) => !current)}>
        Forgot password?
      </button>
      {forgotOpen && (
        <div className="reset-panel">
          <strong>Reset your password</strong>
          <p>Enter your account email and we&apos;ll request a secure reset email.</p>
          <input
            type="email"
            placeholder="you@example.com"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
          />
          <button className="secondary-button full" type="button" onClick={() => void requestReset()}>
            Request reset email
          </button>
          {resetMessage && <small className="reset-message" role="status">{resetMessage}</small>}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"} <ArrowRight size={18} />
      </button>
      <AuthSwitch prompt="Don't have an account?" action="Create an account" onClick={onJoin} />
    </form>
  );
}

function AuthenticatedApp({
  account,
  signOut,
}: {
  account: any;
  signOut: () => Promise<unknown>;
}) {
  const [page, setPage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const createRide = useMutation(api.rides.createRide);
  const acceptRide = useMutation(api.rides.acceptRide);
  const rateCompletedRide = useMutation(api.rides.rateCompletedRide);
  const declineRide = useMutation(api.rides.declineRide);
  const setRiderAvailability = useMutation(api.users.setRiderAvailability);
  const updateStatus = useMutation(api.rides.updateStatus);
  const confirmRideCompletion = useMutation(api.rides.confirmRideCompletion);
  const reportRideIssue = useMutation(api.rides.reportRideIssue);
  const updateProfile = useMutation(api.users.updateProfile);
  const generateVerificationUploadUrl = useMutation(api.users.generateVerificationUploadUrl);
  const submitVerification = useMutation(api.users.submitVerification);
  const initializeWalletFunding = useAction(api.paystack.initializeWalletFunding);
  const verifyWalletFunding = useAction(api.paystack.verifyWalletFunding);
  const verifyWalletFundingByReference = useAction(api.paystack.verifyWalletFundingByReference);
  const requestWithdrawal = useMutation(api.users.requestWithdrawal);
  const requestPayout = useMutation(api.payments.requestPayout);
  const payRideFromWallet = useMutation(api.payments.payRideFromWallet);
  const approvePayout = useMutation(api.payments.approvePayoutRequest);
  const rejectPayout = useMutation(api.payments.rejectPayoutRequest);
  const markPayoutAsPaid = useMutation(api.payments.markPayoutPaid);
  const changePassword = useAction((api as any).account.changePassword);
  const safeAccount = {
    ...account,
    name: typeof account?.name === "string" ? account.name : undefined,
    walletBalance: typeof account?.walletBalance === "number" && Number.isFinite(account.walletBalance)
      ? account.walletBalance
      : 0,
  };
  const role = account.role as Role;
  const verificationStatus = (account.verificationStatus ?? "not_verified") as VerificationStatus;
  const verificationPromptKey = `a9-verification-prompt:${account._id}`;
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(
    () => role === "rider" && verificationStatus === "not_verified" && localStorage.getItem(verificationPromptKey) !== "seen",
  );
  const [verificationGateOpen, setVerificationGateOpen] = useState(false);
  const [rideActionError, setRideActionError] = useState("");
  const [fundingReturnMessage, setFundingReturnMessage] = useState("");
  const paystackReturnReference = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get("reference") ?? query.get("trxref") ?? "";
  }, []);
  useEffect(() => {
    if (!paystackReturnReference) return;
    let active = true;
    void verifyWalletFundingByReference({ reference: paystackReturnReference })
      .then(() => {
        if (active) setFundingReturnMessage("Paystack payment verified. Your wallet balance has been updated.");
      })
      .catch((error) => {
        if (active) setFundingReturnMessage(error instanceof Error ? error.message : "Paystack payment could not be verified.");
      })
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("reference");
        url.searchParams.delete("trxref");
        window.history.replaceState({}, "", url);
      });
    return () => {
      active = false;
    };
  }, [paystackReturnReference, verifyWalletFundingByReference]);
  const rides = normalizeDashboardRides(useQuery(api.rides.listMyRides));
  const openRides = normalizeDashboardRides(useQuery(api.rides.listOpenRides));
  const allRiders = useQuery(api.users.listRiders, role === "student" ? {} : "skip") ?? [];
  const studentRatings = useQuery(api.rides.listMyRideRatings, role === "student" ? {} : "skip") ?? [];
  const riderRating = useQuery(api.rides.getMyRatingSummary, role === "rider" ? {} : "skip");
  const riderRides =
    role === "rider" ? normalizeDashboardRides(useQuery(api.rides.listRiderRides)) : [];
  const handleCreateRide = async (args: any) => {
    return createRide(args);
  };
  const riderEarnings = role === "rider" ? useQuery(api.earnings.getMyEarnings) : null;
  const riderPayouts = role === "rider" ? (useQuery(api.payments.getRiderPayouts) ?? []) : [];
  const wallet = normalizeDashboardWallet(useQuery(api.users.getWallet));
  const closeMenu = () => setMenuOpen(false);
  const openVerification = () => {
    localStorage.setItem(verificationPromptKey, "seen");
    setShowVerificationPrompt(false);
    setVerificationGateOpen(false);
    setPage("verification");
  };
  const uploadVerificationFile = async (file: File) => {
    const uploadUrl = await generateVerificationUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("File upload failed. Please try again.");
    const payload = (await response.json()) as { storageId?: string };
    if (!payload.storageId) throw new Error("File upload did not return a secure file reference.");
    return payload.storageId as Id<"_storage">;
  };
  const handleAccept = async (rideId: Id<"rides">) => {
    setRideActionError("");
    try {
      await acceptRide({ rideId });
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes("Account Verification Required")) {
        setVerificationGateOpen(true);
        return;
      }
      setRideActionError(caught instanceof Error ? caught.message : "Ride request could not be accepted.");
    }
  };
  const handleDecline = async (rideId: Id<"rides">) => {
    setRideActionError("");
    try {
      await declineRide({ rideId });
    } catch (caught) {
      setRideActionError(caught instanceof Error ? caught.message : "Ride request could not be declined.");
    }
  };
  const handleToggleAvailability = async (isOnline: boolean) => {
    setRideActionError("");
    try {
      await setRiderAvailability({ isOnline });
    } catch (caught) {
      setRideActionError(caught instanceof Error ? caught.message : "Availability could not be updated.");
    }
  };
  const handleRateRide = async (rideId: Id<"rides">, stars: number, comment: string) => {
    await rateCompletedRide({ rideId, stars, comment: comment.trim() || undefined });
  };
  const handleRideStatus = async (rideId: Id<"rides">, status: Status) => {
    setRideActionError("");
    try {
      await updateStatus({ rideId, status });
    } catch (caught) {
      setRideActionError(caught instanceof Error ? caught.message : "Ride status could not be updated.");
    }
  };
  const handleConfirmRideCompletion = async (rideId: Id<"rides">) => {
    setRideActionError("");
    try {
      await confirmRideCompletion({ rideId });
    } catch (caught) {
      setRideActionError(caught instanceof Error ? caught.message : "Ride completion could not be confirmed.");
    }
  };
  const handleWalletFunding = async (amount: number): Promise<WalletFundingResult> => {
    const result = await initializeWalletFunding({ amount });
    if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
    return result;
  };
  const handleVerifyWalletFunding = (fundingId: Id<"walletFundingRequests">) => verifyWalletFunding({ fundingId });
  const handlePayRide = async (rideId: Id<"rides">) => {
    setRideActionError("");
    try {
      await payRideFromWallet({ rideId });
    } catch (caught) {
      setRideActionError(caught instanceof Error ? caught.message : "Ride payment could not be completed.");
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("dashboard")}>
          <BrandMark tone="light" wordmark="mobility" />
        </button>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <button
            onClick={() => {
              setPage("dashboard");
              closeMenu();
            }}
          >
            Dashboard
          </button>
          {role === "student" && (
            <button
              className="nav-book-link"
              onClick={() => {
                setPage("booking");
                closeMenu();
              }}
            >
              Book a Ride
            </button>
          )}
          <button
            onClick={() => {
              setPage("help");
              closeMenu();
            }}
          >
            Safety & help
          </button>
          <button
            onClick={() => {
              setPage("settings");
              closeMenu();
            }}
          >
            Account settings
          </button>
        </nav>
        <NotificationsMenu />
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <button className="profile-button" onClick={() => setPage("settings")}>
          <span className="avatar">
            {safeAccount.name?.slice(0, 2).toUpperCase() ?? "A9"}
          </span>
          <span>{safeAccount.name ?? "User"}</span>
        </button>
      </header>
      <main id="top">
        {rideActionError && <div className="ride-action-error" role="alert">{rideActionError}</div>}
        {fundingReturnMessage && <div className="payment-success" role="status">{fundingReturnMessage}</div>}
        {page === "settings" ? (
          <Settings
            account={safeAccount}
            updateProfile={updateProfile}
            changePassword={changePassword}
            signOut={() => void signOut()}
          />
        ) : page === "help" ? (
          <Help />
        ) : page === "verification" && role === "rider" ? (
          <VerificationPage
            account={safeAccount}
            onBack={() => setPage("dashboard")}
            onUpload={uploadVerificationFile}
            onSubmit={(args) => submitVerification(args)}
          />
        ) : page === "booking" ? (
          role === "student" ? (
            <StudentBookingPage
              wallet={wallet}
              onFund={handleWalletFunding}
              onVerifyFunding={handleVerifyWalletFunding}
              onBook={(args) => handleCreateRide(args)}
            />
          ) : (
            <Dashboard
              role={role}
              account={safeAccount}
              riders={allRiders}
              ratings={studentRatings}
              ratingSummary={riderRating}
              rides={rides as Ride[]}
              requestRides={openRides as Ride[]}
              riderRides={riderRides as Ride[]}
              earnings={riderEarnings}
              ride={(rides[0] as Ride | undefined) ?? null}
              riderRide={
                (riderRides[0] as Ride | undefined) ??
                (openRides[0] as Ride | undefined) ??
                null
              }
              wallet={wallet}
              onBook={(args) => void createRide(args)}
              onFund={handleWalletFunding}
              onVerifyFunding={handleVerifyWalletFunding}
              onWithdraw={(args) => requestWithdrawal(args)}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onToggleAvailability={(isOnline) => void handleToggleAvailability(isOnline)}
              onStatus={(id, status) => void handleRideStatus(id, status)}
              onConfirmCompletion={(id) => void handleConfirmRideCompletion(id)}
              onPayRide={handlePayRide}
              onReportIssue={(id, reason) => void reportRideIssue({ rideId: id, reason })}
              onRateRide={handleRateRide}
              onNavigate={setPage}
            />
          )
        ) : page === "wallet" ? (
          role === "student" ? (
            <StudentWalletPage
              wallet={wallet}
              onFund={handleWalletFunding}
              onVerifyFunding={handleVerifyWalletFunding}
              onBack={() => setPage("dashboard")}
            />
          ) : (
            <Dashboard
              role={role}
              account={safeAccount}
              riders={allRiders}
              ratings={studentRatings}
              ratingSummary={riderRating}
              rides={rides as Ride[]}
              requestRides={openRides as Ride[]}
              riderRides={riderRides as Ride[]}
              earnings={riderEarnings}
              ride={(rides[0] as Ride | undefined) ?? null}
              riderRide={
                (riderRides[0] as Ride | undefined) ??
                (openRides[0] as Ride | undefined) ??
                null
              }
              wallet={wallet}
              onBook={(args) => void createRide(args)}
              onFund={handleWalletFunding}
              onVerifyFunding={handleVerifyWalletFunding}
              onWithdraw={(args) => requestWithdrawal(args)}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onToggleAvailability={(isOnline) => void handleToggleAvailability(isOnline)}
              onStatus={(id, status) => void handleRideStatus(id, status)}
              onConfirmCompletion={(id) => void confirmRideCompletion({ rideId: id })}
              onPayRide={handlePayRide}
              onReportIssue={(id, reason) => void reportRideIssue({ rideId: id, reason })}
              onRateRide={handleRateRide}
              onRequestPayout={(earningsId) => requestPayout({ earningsId })}
              onApprovePayout={(payoutId) => approvePayout({ payoutId })}
              onRejectPayout={(payoutId, reason) => rejectPayout({ payoutId, reason })}
              onMarkPayoutPaid={(payoutId, method, notes) => markPayoutAsPaid({ payoutId, method, notes })}
              onNavigate={setPage}
            />
          )
        ) : (
          <Dashboard
            role={role}
            account={safeAccount}
            riders={allRiders}
            ratings={studentRatings}
            ratingSummary={riderRating}
            rides={rides as Ride[]}
            requestRides={openRides as Ride[]}
            riderRides={riderRides as Ride[]}
            earnings={riderEarnings}
            payoutHistory={riderPayouts}
            ride={(rides[0] as Ride | undefined) ?? null}
            riderRide={
              (riderRides[0] as Ride | undefined) ??
              (openRides[0] as Ride | undefined) ??
              null
            }
            wallet={wallet}
            onBook={(args) => void createRide(args)}
            onFund={handleWalletFunding}
            onVerifyFunding={handleVerifyWalletFunding}
              onWithdraw={(args) => requestWithdrawal(args)}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onToggleAvailability={(isOnline) => void handleToggleAvailability(isOnline)}
            onStatus={(id, status) => void handleRideStatus(id, status)}
            onConfirmCompletion={(id) => void confirmRideCompletion({ rideId: id })}
            onPayRide={handlePayRide}
            onReportIssue={(id, reason) => void reportRideIssue({ rideId: id, reason })}
            onRateRide={handleRateRide}
            onRequestPayout={(earningsId) => requestPayout({ earningsId })}
            onApprovePayout={(payoutId) => approvePayout({ payoutId })}
            onRejectPayout={(payoutId, reason) => rejectPayout({ payoutId, reason })}
            onMarkPayoutPaid={(payoutId, method, notes) => markPayoutAsPaid({ payoutId, method, notes })}
            onNavigate={setPage}
          />
        )}
      </main>
      <footer>
        <BrandMark tone="light" size={24} />
        <span>A9 / local mobility</span>
        <span>Move freely. Arrive fully.</span>
      </footer>
      {showVerificationPrompt && (
        <VerificationPrompt onVerify={openVerification} onLater={() => {
          localStorage.setItem(verificationPromptKey, "seen");
          setShowVerificationPrompt(false);
        }} />
      )}
      {verificationGateOpen && <VerificationRequiredModal onVerify={openVerification} onClose={() => setVerificationGateOpen(false)} />}
    </div>
  );
}

function NotificationsMenu() {
  const notifications = useQuery(api.marketplace.listMyNotifications) ?? [];
  const markNotificationRead = useMutation(api.marketplace.markNotificationRead);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const unreadCount = notifications.filter((notification) => notification.readAt === undefined).length;
  return (
    <div className="notifications-menu">
      <button className="notifications-trigger" type="button" aria-label={`Notifications (${unreadCount} unread)`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Bell size={18} />{unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <section className="notifications-panel" aria-label="Notifications">
        <strong>Notifications</strong>
        {error && <p className="payment-error" role="alert">{error}</p>}
        {notifications.length === 0 ? <p className="settings-muted">You have no notifications yet.</p> : notifications.map((notification) => (
          <article className={notification.readAt === undefined ? "notification-item unread" : "notification-item"} key={notification._id}>
            <div><strong>{notification.title}</strong><p>{notification.body}</p><small>{formatNigerianDateTime(notification.createdAt)}</small></div>
            {notification.readAt === undefined && <button type="button" onClick={() => { setError(""); void markNotificationRead({ notificationId: notification._id }).catch((caught) => setError(caught instanceof Error ? caught.message : "Notification could not be marked as read.")); }}>Mark read</button>}
          </article>
        ))}
      </section>}
    </div>
  );
}

function Dashboard({
  role,
  account,
  ratings,
  ratingSummary,
  rides,
  requestRides,
  riderRides,
  riders,
  earnings,
  payoutHistory,
  ride,
  riderRide,
  wallet,
  onBook,
  onFund,
  onVerifyFunding,
  onWithdraw,
  onAccept,
  onDecline,
  onToggleAvailability,
  onStatus,
  onConfirmCompletion,
  onPayRide,
  onReportIssue,
  onRateRide,
  onRequestPayout,
  onApprovePayout,
  onRejectPayout,
  onMarkPayoutPaid,
  onNavigate,
}: {
  role: Role;
  account: any;
  ratings: Array<{ rideId: Id<"rides">; stars: number; comment?: string; createdAt: number }>;
  ratingSummary: { averageRating: number; ratingCount: number } | null | undefined;
  rides: Ride[];
  requestRides: Ride[];
  riderRides: Ride[];
  riders?: Array<{ _id: Id<"users">; name?: string }>;
  earnings: any;
  payoutHistory?: Array<any>;
  ride: Ride | null;
  riderRide: Ride | null;
  wallet: any;
  onBook: (args: any) => void;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
  onWithdraw: (args: { amount: number; bankName: string; accountNumber: string; accountName: string }) => Promise<Id<"withdrawals">>;
  onAccept: (id: Id<"rides">) => Promise<void>;
  onDecline: (id: Id<"rides">) => Promise<void>;
  onToggleAvailability: (isOnline: boolean) => void;
  onStatus: (id: Id<"rides">, status: Status) => void;
  onConfirmCompletion: (id: Id<"rides">) => void;
  onPayRide: (id: Id<"rides">) => Promise<void>;
  onReportIssue: (id: Id<"rides">, reason: string) => void;
  onRateRide: (id: Id<"rides">, stars: number, comment: string) => Promise<void>;
  onRequestPayout?: (earningsId: Id<"riderEarnings">) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }>;
  onApprovePayout?: (payoutId: Id<"payouts">) => Promise<unknown>;
  onRejectPayout?: (payoutId: Id<"payouts">, reason: string) => Promise<unknown>;
  onMarkPayoutPaid?: (payoutId: Id<"payouts">, method: string, notes: string) => Promise<unknown>;
  onNavigate: (page: Page) => void;
}) {
  const safeRequestPayout: (earningsId: Id<"riderEarnings">) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }> =
    onRequestPayout ?? (async () => {
      throw new Error("Payout action is not available for this account.");
    });
  if (role === "student") {
    return (
      <StudentDashboard
        account={account}
        rides={rides}
        ratings={ratings}
        riders={riders ?? []}
        wallet={wallet}
        onOpenBooking={() => onNavigate("booking")}
        onFund={onFund}
        onWithdraw={onWithdraw}
        onOpenSettings={() => onNavigate("settings")}
        onConfirmCompletion={onConfirmCompletion}
        onPayRide={onPayRide}
        onReportIssue={onReportIssue}
        onRateRide={onRateRide}
        onVerifyFunding={onVerifyFunding}
      />
    );
  }
  if (role === "rider") {
    return (
      <RiderDashboard
        account={account}
        requests={requestRides}
        rides={rides}
        assignedRides={riderRides}
        earnings={earnings}
        ratingSummary={ratingSummary}
        payoutHistory={payoutHistory ?? []}
        onAccept={onAccept}
        onDecline={onDecline}
        onStatus={onStatus}
        onToggleAvailability={onToggleAvailability}
        onOpenVerification={() => onNavigate("verification")}
        onRequestPayout={safeRequestPayout}
      />
    );
  }
  return <AdminDashboard account={account} />;
  /*
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <ShieldCheck size={15} /> {role} account
          </span>
          <>
            <h1>
              Move through Ebonyi <em>your way.</em>
            </h1>
            <p>
              Welcome back, {account.name}. Your A9 dashboard is connected to live
              Convex data.
            </p>
            <button
              className="primary-button"
              onClick={() =>
                document
                  .getElementById("workspace")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              View operations{" "}
              <ArrowRight size={18} />
            </button>
          </>
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <Bike size={96} strokeWidth={1.1} />
          <div className="location-pin pin-top">
            <MapPin size={17} /> Abakaliki / Ebonyi
          </div>
          <div className="art-caption">
            <ShieldCheck size={18} />
            <span>
              Secure accounts.
              <br />
              <strong>Local mobility.</strong>
            </span>
          </div>
        </div>
      </section>
      <section className="workspace" id="workspace">
        <Operations verificationQueue={useQuery(api.users.listVerificationSubmissions) ?? []} />
      </section>
    </>
  );
  */
}

function StudentDashboard({
  account,
  rides,
  ratings,
  riders,
  wallet,
  onFund,
  onOpenBooking,
  onWithdraw,
  onOpenSettings,
  onConfirmCompletion,
  onPayRide,
  onReportIssue,
  onRateRide,
  onVerifyFunding,
}: {
  account: any;
  rides: Ride[];
  ratings: Array<{ rideId: Id<"rides">; stars: number; comment?: string; createdAt: number }>;
  riders: Array<{ _id: Id<"users">; name?: string }>;
  wallet: any;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onOpenBooking: () => void;
  onWithdraw: (args: { amount: number; bankName: string; accountNumber: string; accountName: string }) => Promise<Id<"withdrawals">>;
  onOpenSettings: () => void;
  onConfirmCompletion: (id: Id<"rides">) => void;
  onPayRide: (id: Id<"rides">) => Promise<void>;
  onReportIssue: (id: Id<"rides">, reason: string) => void;
  onRateRide: (id: Id<"rides">, stars: number, comment: string) => Promise<void>;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
}) {
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [cancelRideId, setCancelRideId] = useState<Id<"rides"> | null>(null);
  const [cancelRideTimeout, setCancelRideTimeout] = useState(false);
  const activeRide = rides.find((item) => ["negotiating", "offer_made", "accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(item.status))
    ?? rides.find((item) => item.status === "requested");
  const recentRides = rides.slice(0, 4);
  const ratedRideIds = new Set(ratings.map((rating) => String(rating.rideId)));
  const rideAwaitingRating = rides.find((ride) => ride.status === "completed" && !ratedRideIds.has(String(ride._id)));
  const firstName = account.name?.trim().split(/\s+/)[0] ?? "there";
  const riderLookup = new Map(riders.map((rider) => [String(rider._id), rider.name ?? "A9 rider"]));
  const selectedRiderName = selectedRide?.riderId ? riderLookup.get(String(selectedRide.riderId)) ?? "Awaiting rider" : "Awaiting rider";
  return (
    <div className="student-dashboard">
      <header className="student-dashboard-header">
        <div>
          <span className="eyebrow">Customer dashboard</span>
          <h1>Good to see you, {firstName} 👋</h1>
        </div>
        <button className="student-profile-access" type="button" onClick={onOpenSettings}>
          <span className="avatar">{account.name?.slice(0, 2).toUpperCase() ?? "A9"}</span>
          <span>Profile</span>
        </button>
      </header>

      <section className="student-dashboard-hero">
        <div className="student-dashboard-hero-wallet">
          <StudentWalletCard wallet={wallet} onFund={onFund} onVerifyFunding={onVerifyFunding} onWithdraw={onWithdraw} />
        </div>
      </section>

      {activeRide?.status === "awaiting_confirmation" && <StudentCompletionCard ride={activeRide} onConfirm={onConfirmCompletion} onReport={onReportIssue} />}
      {rideAwaitingRating && <StudentRatingCard ride={rideAwaitingRating} riderName={rideAwaitingRating.riderId ? riderLookup.get(String(rideAwaitingRating.riderId)) ?? "Your A9 rider" : "Your A9 rider"} onRate={onRateRide} />}

      <div className="student-dashboard-columns">
        <section className="student-dashboard-section">
          <div className="student-section-heading">
            <div><span className="eyebrow">Trip status</span><h2>Active ride</h2></div>
          </div>
          {activeRide ? <><ActiveRideCard ride={activeRide} onPay={onPayRide} onCancel={(rideId) => { setCancelRideTimeout(false); setCancelRideId(rideId); }} onTimeoutCancel={(rideId) => { setCancelRideTimeout(true); setCancelRideId(rideId); }} />{activeRide.status === "negotiating" && <NegotiationRoom ride={activeRide} role="student" />}</> : rides[0]?.cancellationReason === "rider_arrival_timeout" ? <EmptyRideState title="Rider arrival window expired" message="Your full refund is in your wallet. You can request another ride now." action="Request another ride" onClick={onOpenBooking} /> : <EmptyRideState title="No active ride" message="Your next trip will appear here once you request a ride." action="Book a Ride" onClick={onOpenBooking} />}
        </section>

        <section className="student-dashboard-section" id="recent-rides">
          <div className="student-section-heading">
            <div><span className="eyebrow">Your activity</span><h2>Recent rides</h2></div>
          </div>
          {recentRides.length > 0 ? <div className="recent-rides-list">{recentRides.map((ride) => <RecentRideRow key={ride._id} ride={ride} onOpen={() => setSelectedRide(ride)} />)}</div> : <EmptyRideState title="No rides yet" message="Your completed and requested trips will be saved here." action="Book your first ride" onClick={onOpenBooking} />}
        </section>
      </div>

      {selectedRide && (
        <RideDetailsModal
          ride={selectedRide}
          riderName={selectedRiderName}
          onClose={() => setSelectedRide(null)}
        />
      )}

      {cancelRideId && (
        <RideCancelModal
          rideId={cancelRideId}
          timeout={cancelRideTimeout}
          onClose={() => { setCancelRideId(null); setCancelRideTimeout(false); }}
          onConfirm={() => {
            setCancelRideId(null);
          }}
        />
      )}
    </div>
  );
}

function NegotiationRoom({ ride, role, walletBalance }: { ride: Ride; role: "student" | "rider"; walletBalance?: number }) {
  const submitPriceOffer = useMutation(api.rides.submitPriceOffer);
  const acceptFinalPriceAndLock = useMutation(api.rides.acceptFinalPriceAndLock);
  const [price, setPrice] = useState(ride.proposedPrice === undefined ? "" : String(ride.proposedPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setPrice(ride.proposedPrice === undefined ? "" : String(ride.proposedPrice));
  }, [ride.proposedPrice]);
  const submitCounterOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const proposedPrice = Number(price);
    if (!Number.isSafeInteger(proposedPrice) || proposedPrice < 250 || busy) return;
    setBusy(true);
    setError("");
    try {
      await submitPriceOffer({ rideId: ride._id, proposedPrice });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your price could not be submitted.");
    } finally {
      setBusy(false);
    }
  };
  const acceptPrice = async () => {
    if (ride.proposedPrice === undefined || busy) return;
    setBusy(true);
    setError("");
    try {
      await acceptFinalPriceAndLock({ rideId: ride._id, agreedFare: ride.proposedPrice });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The fare could not be accepted.");
    } finally {
      setBusy(false);
    }
  };
  const proposedByOther = role === "student"
    ? ride.proposedBy === ride.riderId
    : ride.proposedBy === ride.userId;
  const priceAgreed = ride.proposedPrice !== undefined && ride.agreedFare === ride.proposedPrice;
  return (
    <section className="negotiation-room">
      <div className="section-heading">
        <div><span className="eyebrow">Live negotiation</span><h3>Agree on your ride price</h3></div>
        <span className="ride-status-pill"><span /> Negotiating</span>
      </div>
      <div className="negotiation-route">
        <div><span>Pickup</span><strong>{ride.pickupLabel ?? "Pickup unavailable"}</strong></div>
        <ArrowRight size={17} />
        <div><span>Destination</span><strong>{ride.destinationLabel ?? "Destination unavailable"}</strong></div>
      </div>
      <div className="negotiation-price">
        <span>{ride.proposedPrice === undefined ? "Waiting for the first price" : priceAgreed ? "Both parties proposed this price" : proposedByOther ? "Latest offer from the other party" : "Your latest counter-offer"}</span>
        <strong>{ride.proposedPrice === undefined ? "—" : formatNaira(ride.proposedPrice)}</strong>
      </div>
      <form className="negotiation-counter-form" onSubmit={(event) => void submitCounterOffer(event)}>
        <label>Counter-offer (NGN)<input type="number" min="250" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Enter your price" /></label>
        <button className="secondary-button" type="submit" disabled={busy || !Number.isSafeInteger(Number(price)) || Number(price) < 250}>{busy ? "Sending..." : "Send counter-offer"}</button>
      </form>
      {role === "student" && ride.proposedPrice !== undefined && (proposedByOther || priceAgreed) && (
        <div className="negotiation-accept">
          {walletBalance !== undefined && <span>Available wallet balance: {formatNaira(walletBalance)}</span>}
          <button className="primary-button" type="button" onClick={() => void acceptPrice()} disabled={busy}>
            {busy ? "Securing payment..." : `Accept & Pay (${formatNaira(ride.proposedPrice)})`}
          </button>
        </div>
      )}
      {error && <p className="payment-error" role="alert">{error}</p>}
      <small>Payment is held securely in escrow only after you accept the rider&apos;s current price.</small>
    </section>
  );
}

function StudentCompletionCard({ ride, onConfirm, onReport }: { ride: Ride; onConfirm: (id: Id<"rides">) => void; onReport: (id: Id<"rides">, reason: string) => void }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const confirmationUnavailable = !ride.riderId || ride.paymentStatus !== "paid";
  return (
    <section className="student-completion-card">
      <span className="eyebrow"><CheckCircle2 size={14} /> Destination reached</span>
      <h2>Confirm Ride Completion</h2>
      <p>Your rider marked this ride complete. Confirming releases {formatNaira(ride.agreedFare ?? ride.fare ?? 0)} from A9 held payment into rider earnings.</p>
      <div className="student-completion-details">
        <span>Destination<strong>{ride.destinationLabel ?? "Destination unavailable"}</strong></span>
        <span>Ride reference<strong>{String(ride._id).slice(-9)}</strong></span>
        <span>Rider<strong>{ride.riderId ? "Assigned A9 rider" : "Rider unavailable"}</strong></span>
      </div>
      {confirmationUnavailable && (
        <p className="settings-muted" role="status">
          Confirmation is unavailable until the assigned rider and payment details are verified. Contact A9 support if this continues.
        </p>
      )}
      {reporting ? (
        <div className="student-issue-form">
          <label htmlFor="ride-issue">Report an issue</label>
          <textarea id="ride-issue" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell A9 what happened" />
          <div>
            <button className="secondary-button" type="button" onClick={() => setReporting(false)}>Cancel</button>
            <button className="admin-danger-button" type="button" onClick={() => onReport(ride._id, reason)} disabled={!reason.trim()}>Report Issue</button>
          </div>
        </div>
      ) : (
        <div className="student-completion-actions">
          <button className="primary-button" type="button" onClick={() => onConfirm(ride._id)} disabled={confirmationUnavailable}>Complete Ride <Check size={16} /></button>
          <button className="secondary-button" type="button" onClick={() => setReporting(true)}>Report an Issue</button>
        </div>
      )}
    </section>
  );
}

function StudentRatingCard({
  ride,
  riderName,
  onRate,
}: {
  ride: Ride;
  riderName: string;
  onRate: (rideId: Id<"rides">, stars: number, comment: string) => Promise<void>;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (stars < 1 || busy || submitted) return;
    setBusy(true);
    setError("");
    try {
      await onRate(ride._id, stars, comment);
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your rating could not be submitted.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="student-rating-card" aria-labelledby="student-rating-title">
      <div className="student-rating-copy">
        <span className="eyebrow">Ride complete · Your feedback</span>
        <h2 id="student-rating-title">How was your ride?</h2>
        <p>Rate {riderName} to help keep A9 rides reliable.</p>
      </div>
      <div className="student-rating-stars" role="group" aria-label="Rate this ride from 1 to 5 stars">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={value <= stars ? "student-rating-star selected" : "student-rating-star"}
            onClick={() => setStars(value)}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            aria-pressed={stars === value}
            disabled={submitted || busy}
          >
            <Star size={31} fill={value <= stars ? "currentColor" : "none"} />
          </button>
        ))}
        <span>{stars ? `${stars} of 5` : "Choose a rating"}</span>
      </div>
      <label className="student-rating-feedback" htmlFor={`ride-feedback-${ride._id}`}>
        Optional feedback
        <textarea
          id={`ride-feedback-${ride._id}`}
          rows={2}
          maxLength={280}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Share a short note about your ride"
          disabled={submitted || busy}
        />
        <small>{comment.length}/280</small>
      </label>
      {error && <p className="payment-error" role="alert">{error}</p>}
      {submitted ? (
        <p className="student-rating-thanks" role="status">Thanks for rating your A9 ride.</p>
      ) : (
        <button className="primary-button student-rating-submit" type="button" onClick={() => void submit()} disabled={stars < 1 || busy}>
          {busy ? "Submitting..." : "Submit rating"}
        </button>
      )}
    </section>
  );
}

function ActiveRideCard({ ride, onPay, onCancel, onTimeoutCancel }: { ride: Ride; onPay: (rideId: Id<"rides">) => Promise<void>; onCancel: (rideId: Id<"rides">) => void; onTimeoutCancel: (rideId: Id<"rides">) => void }) {
  const isPendingRequest = ["requested", "negotiating", "offer_made"].includes(ride.status);
  const [paying, setPaying] = useState(false);
  const hasArrivalWindow = ["accepted", "rider_arriving"].includes(ride.status) && ride.acceptedAt !== undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasArrivalWindow) return;
    const syncClock = () => setNow(Date.now());
    const interval = window.setInterval(syncClock, 1000);
    document.addEventListener("visibilitychange", syncClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", syncClock);
    };
  }, [hasArrivalWindow, ride.acceptedAt]);
  const remainingMs = hasArrivalWindow ? Math.max(0, ride.acceptedAt! + 15 * 60 * 1000 - now) : 0;
  const arrivalWindowElapsed = hasArrivalWindow && remainingMs === 0;
  const minutes = String(Math.floor(remainingMs / 60_000)).padStart(2, "0");
  const seconds = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0");
  const cancellationAllowed = ["requested", "negotiating", "offer_made", "accepted", "rider_arriving", "in_progress"].includes(ride.status) && !["awaiting_confirmation", "completed", "cancelled", "disputed"].includes(ride.status);
  const showNormalCancellation = cancellationAllowed && !arrivalWindowElapsed;
  return (
    <div className="active-ride-card">
      <div className="active-ride-top"><span className="ride-status-pill"><span />{rideStatusLabel(ride)}</span><strong>{ride.fare === undefined ? "Price negotiation" : formatNaira(ride.fare)}</strong></div>
      <div className="ride-route-line"><div><span>Pickup</span><strong>{ride.pickupLabel ?? "Pickup unavailable"}</strong></div><ArrowRight size={18} /><div><span>Destination</span><strong>{ride.destinationLabel ?? "Destination unavailable"}</strong></div></div>
      <div className="active-ride-meta">
        <span>{isPendingRequest ? "No money is deducted until you accept the negotiated price." : ride.paymentStatus === "paid" ? `${formatNaira(ride.paymentAmount ?? ride.fare ?? 0)} held by A9 until the ride is completed.` : "Payment status pending"}</span>
        <strong>{isPendingRequest ? ride.status === "negotiating" ? "Negotiation in progress" : "Waiting for Rider" : ride.paymentStatus === "paid" ? "Payment secured" : "Awaiting payment"}</strong>
      </div>
      {hasArrivalWindow && (
        <div className="rider-arrival-timeout">
          {remainingMs > 0 ? (
            <p><strong>Rider is on the way</strong><span>Your rider has {minutes}:{seconds} to arrive.</span></p>
          ) : (
            <>
              <p><strong>Rider hasn&apos;t arrived?</strong><span>Your rider has exceeded the 15-minute arrival window.</span></p>
              <button className="secondary-button" type="button" onClick={() => onTimeoutCancel(ride._id)}>Cancel &amp; get full refund</button>
            </>
          )}
        </div>
      )}
      {showNormalCancellation && (
        <div className="active-ride-actions">
          {ride.requestStatus === "booked" && ride.status === "accepted" && ride.paymentStatus !== "paid" && (
            <button className="primary-button" type="button" disabled={paying} onClick={() => { setPaying(true); void onPay(ride._id).finally(() => setPaying(false)); }}>
            {paying ? "Processing payment..." : `Pay ${formatNaira(ride.fare ?? 0)} from wallet`}
            </button>
          )}
          <button className="secondary-button" type="button" onClick={() => onCancel(ride._id)}>Cancel Ride</button>
        </div>
      )}
    </div>
  );
}

function RecentRideRow({ ride, onOpen }: { ride: Ride; onOpen: () => void }) {
  return <button type="button" className="recent-ride-row" onClick={onOpen}><span className={ride.status === "cancelled" ? "recent-ride-icon cancelled" : "recent-ride-icon"}><MapPin size={16} /></span><div><strong>{ride.pickupLabel ?? "Pickup unavailable"} <span>to</span> {ride.destinationLabel ?? "Destination unavailable"}</strong><small>{ride.paymentStatus === "paid" ? "Paid" : (["requested", "negotiating", "offer_made"].includes(ride.status) ? "Not charged yet" : "Payment pending")} · {rideStatusLabel(ride)} · {formatNigerianDate(ride.requestedAt)}</small></div><strong className="recent-ride-fare">{ride.fare === undefined ? "Price not set" : formatNaira(ride.fare)}</strong></button>;
}

function EmptyRideState({ title, message, action, onClick }: { title: string; message: string; action: string; onClick: () => void }) {
  return <div className="empty-ride-state"><span className="empty-ride-icon"><Bike size={22} /></span><div><h3>{title}</h3><p>{message}</p></div><button className="secondary-button" type="button" onClick={onClick}>{action}</button></div>;
}

function RideDetailsModal({ ride, riderName, onClose }: { ride: Ride; riderName: string; onClose: () => void }) {
  const paymentText = ride.paymentStage === "refunded"
    ? "Refunded"
    : ride.paymentStage === "eligible_for_rider" || ride.paymentStage === "pending_payout" || ride.paymentStage === "paid_to_rider"
      ? "Settled to rider earnings"
      : ride.paymentStage === "paid_held" || ride.paymentStage === "awaiting_completion"
        ? "Held by A9"
        : ["requested", "negotiating", "offer_made"].includes(ride.status) ? "Not charged yet" : "Pending";
  const statusText = rideStatusLabel(ride);
  return (
    <div className="ride-details-overlay" role="dialog" aria-modal="true">
      <div className="ride-details-modal">
        <div className="ride-details-header">
          <div>
            <span className="eyebrow">Ride details</span>
            <h3>{ride.pickupLabel ?? "Pickup unavailable"} → {ride.destinationLabel ?? "Destination unavailable"}</h3>
          </div>
          <button className="icon-close-button" type="button" onClick={onClose} aria-label="Close ride details"><X size={18} /></button>
        </div>

        <div className="ride-details-grid">
          <div className="ride-detail-card">
            <span className="eyebrow">Ride</span>
            <div className="ride-detail-row"><span>Pickup</span><strong>{ride.pickupLabel ?? "Pickup unavailable"}</strong></div>
            <div className="ride-detail-row"><span>Destination</span><strong>{ride.destinationLabel ?? "Destination unavailable"}</strong></div>
            <div className="ride-detail-row"><span>Fare</span><strong>{ride.fare === undefined ? "To be negotiated" : formatNaira(ride.fare)}</strong></div>
          </div>

          <div className="ride-detail-card">
            <span className="eyebrow">Rider</span>
            <div className="ride-detail-row"><span>Name</span><strong>{riderName}</strong></div>
          </div>

          <div className="ride-detail-card">
            <span className="eyebrow">Trip status</span>
            <div className="ride-detail-row"><span>Current status</span><strong>{statusText}</strong></div>
          </div>

          <div className="ride-detail-card">
            <span className="eyebrow">Payment</span>
            <div className="ride-detail-row"><span>Fare</span><strong>{ride.fare === undefined ? "To be negotiated" : formatNaira(ride.fare)}</strong></div>
            <div className="ride-detail-row"><span>Payment status</span><strong>{paymentText}</strong></div>
          </div>

          <div className="ride-detail-card full-width">
            <span className="eyebrow">Trip information</span>
            <div className="ride-detail-row"><span>Date</span><strong>{formatNigerianDate(ride.requestedAt)}</strong></div>
            <div className="ride-detail-row"><span>Time</span><strong>{formatNigerianTime(ride.requestedAt)}</strong></div>
            <div className="ride-detail-row"><span>Reference ID</span><strong className="ride-reference-id">{String(ride._id)}</strong></div>
            <div className="ride-detail-row"><span>Created</span><strong>{formatNigerianDateTime(ride.requestedAt)}</strong></div>
            <div className="ride-detail-row"><span>Rider accepted</span><strong>{ride.acceptedAt ? formatNigerianDateTime(ride.acceptedAt) : "Awaiting rider"}</strong></div>
            <div className="ride-detail-row"><span>Started</span><strong>{ride.completedAt ? "Ride started" : "Not started yet"}</strong></div>
            <div className="ride-detail-row"><span>Completed</span><strong>{ride.completedAt ? formatNigerianDateTime(ride.completedAt) : "Not completed yet"}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RideCancelModal({ rideId, timeout = false, onClose, onConfirm }: { rideId: Id<"rides">; timeout?: boolean; onClose: () => void; onConfirm: () => void }) {
  const cancelRide = useMutation((api.rides as any).cancelRide);
  const cancelAfterTimeout = useMutation((api.rides as any).cancelRideAfterArrivalTimeout);
  const normalQuote = useQuery((api.rides as any).getCancellationQuote, timeout ? "skip" : { rideId });
  const timeoutQuote = useQuery((api.rides as any).getRiderArrivalTimeoutQuote, timeout ? { rideId } : "skip");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const canConfirm = timeout ? timeoutQuote?.canCancelFree : normalQuote?.canCancel;
  const submit = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (timeout) await cancelAfterTimeout({ rideId });
      else await cancelRide({ rideId });
      onConfirm();
      onClose();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Ride could not be cancelled.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ride-details-overlay ride-cancel-overlay" role="dialog" aria-modal="true" aria-labelledby="cancel-ride-title">
      <div className="confirm-modal compact ride-cancel-modal">
        <span className="eyebrow">Cancel ride</span>
        <h3 id="cancel-ride-title">Cancel this ride?</h3>
        {timeout ? timeoutQuote ? timeoutQuote.canCancelFree ? (
          <>
            <p>Your rider exceeded the 15-minute arrival window.</p>
            <div className="cancellation-summary">
              <div><span>Full refund</span><strong>{formatKobo(timeoutQuote.refundKobo)}</strong></div>
              <div><span>Cancellation fee</span><strong>{formatKobo(0)}</strong></div>
            </div>
          </>
        ) : <p>The server has not confirmed timeout eligibility. The ride may have started or the 15-minute window may not have elapsed.</p> : <p>Checking the server-verified arrival window...</p> : normalQuote ? normalQuote.canCancel ? (
          <>
            <p>{normalQuote.isArrivalTimeout ? "The rider exceeded the arrival window. Cancellation is free with a full refund." : normalQuote.isFree ? "Cancellation is free while waiting for a rider." : "A 20% cancellation fee applies to an accepted or started ride."}</p>
            <div className="cancellation-summary">
              <div><span>Ride fare</span><strong>{formatKobo(normalQuote.fareKobo)}</strong></div>
              <div><span>Cancellation fee</span><strong>{formatKobo(normalQuote.cancellationFeeKobo)}</strong></div>
              <div><span>Refund to wallet</span><strong>{formatKobo(normalQuote.refundKobo)}</strong></div>
            </div>
          </>
        ) : <p>This ride can no longer be cancelled.</p> : <p>Loading cancellation details...</p>}
        {message && <p className="payment-error" role="alert">{message}</p>}
        <div className="confirm-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Keep Ride</button>
          <button className="admin-danger-button" type="button" onClick={() => void submit()} disabled={busy || !canConfirm}>{busy ? "Cancelling..." : "Cancel Ride"}</button>
        </div>
      </div>
    </div>
  );
}

function StudentWalletCard({
  wallet,
  onFund,
  onVerifyFunding,
  onWithdraw,
}: {
  wallet: any;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
  onWithdraw: (args: { amount: number; bankName: string; accountNumber: string; accountName: string }) => Promise<Id<"withdrawals">>;
}) {
  const [fundingOpen, setFundingOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [withdrawalState, setWithdrawalState] = useState<"idle" | "loading">("idle");
  const [withdrawalMessage, setWithdrawalMessage] = useState("");
  const [fundingId, setFundingId] = useState<Id<"walletFundingRequests"> | null>(null);
  const [fundingState, setFundingState] = useState<"idle" | "loading">("idle");
  const [fundingMessage, setFundingMessage] = useState("");
  const transactions = (wallet?.transactions ?? []) as Array<{
    _id: string;
    amount: number;
    description: string;
    createdAt: number;
    type: string;
    status?: string;
    currency?: "NGN";
  }>;
  return (
    <section className="student-wallet-card" aria-label="Wallet">
      <div className="student-wallet-card-top">
        <div>
          <span className="eyebrow"><WalletCards size={14} /> A9 wallet</span>
          <strong className="student-wallet-balance">{formatNaira(wallet?.balance ?? 0)}</strong>
          <span className="student-wallet-label">Available balance</span>
        </div>
        <span className="wallet-security"><ShieldCheck size={14} /> Secure</span>
      </div>
      <div className="student-wallet-actions">
        <button className="wallet-action-primary" type="button" onClick={() => setFundingOpen((current) => !current)}>
          <WalletCards size={16} /> Add Money
        </button>
        <button className="wallet-action-secondary" type="button" onClick={() => setWithdrawalOpen((current) => !current)}>
          <ArrowDownToLine size={16} /> Withdraw Money
        </button>
      </div>
      {fundingOpen && (
        <div className="student-wallet-funding">
          <p>Secure wallet funding via Paystack. Your balance updates only after verified payment.</p>
          <div className="student-wallet-funding-row">
            <input type="number" min="1" placeholder="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <button className="wallet-action-primary" type="button" disabled={fundingState === "loading"} onClick={() => { setFundingState("loading"); setFundingMessage(""); void onFund(Number(amount)).then((result) => { setFundingId(result.fundingId); setFundingMessage("Checkout opened. Complete payment, then verify it here."); }).catch((error) => { setFundingMessage(error instanceof Error ? error.message : "Unable to initialize payment. Please try again."); }).finally(() => setFundingState("idle")); }}>
              {fundingState === "loading" ? "Initializing payment..." : "Request"}
            </button>
          </div>
          {fundingMessage && <p className={fundingMessage.includes("opened") ? "payment-success" : "payment-error"}>{fundingMessage}</p>}
          {fundingId && <button className="secondary-button" type="button" onClick={() => void onVerifyFunding(fundingId).then(() => setFundingMessage("Wallet funding verified. Refreshing balance...")).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Payment is not verified yet."))}>Verify completed payment</button>}
        </div>
      )}
      {withdrawalOpen && (
        <div className="student-wallet-funding withdrawal-panel">
          <p>Withdrawals are recorded securely and remain pending until A9 payout infrastructure is configured. No funds are sent automatically.</p>
          <strong>Available: {formatNaira(wallet?.balance ?? 0)}</strong>
          <input type="number" min="1" max={wallet?.balance ?? undefined} placeholder="Withdrawal amount" value={withdrawalAmount} onChange={(event) => setWithdrawalAmount(event.target.value)} />
          <input type="text" placeholder="Bank name" value={bankName} onChange={(event) => setBankName(event.target.value)} />
          <input type="text" inputMode="numeric" maxLength={10} placeholder="10-digit account number" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} />
          <input type="text" placeholder="Account name" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
          <button className="wallet-action-primary" type="button" disabled={withdrawalState === "loading"} onClick={() => { setWithdrawalState("loading"); setWithdrawalMessage(""); void onWithdraw({ amount: Number(withdrawalAmount), bankName, accountNumber, accountName }).then(() => { setWithdrawalMessage("Withdrawal request recorded as pending. Your balance remains reserved until it is processed."); setWithdrawalAmount(""); }).catch((error) => setWithdrawalMessage(error instanceof Error ? error.message : "Withdrawal could not be requested.")).finally(() => setWithdrawalState("idle")); }}>
            {withdrawalState === "loading" ? "Submitting..." : "Continue withdrawal"}
          </button>
          {withdrawalMessage && <p className={withdrawalMessage.includes("recorded") ? "payment-success" : "payment-error"}>{withdrawalMessage}</p>}
        </div>
      )}
      <div className="student-wallet-activity">
        <div className="student-wallet-activity-heading">
          <span>Recent activity</span>
          {transactions.length > 0 && <span>{transactions.length} entries</span>}
        </div>
        {transactions.length === 0 ? (
          <p className="student-wallet-empty">No wallet activity yet. Add funds or book your first ride to see activity here.</p>
        ) : (
          transactions.slice(0, 3).map((transaction) => (
            <div className="student-wallet-transaction" key={transaction._id}>
              <span className={transaction.amount < 0 ? "transaction-dot debit" : "transaction-dot"} />
              <span><strong>{transaction.description}</strong><small>{new Date(transaction.createdAt).toLocaleDateString()}{transaction.status ? ` · ${transaction.status[0].toUpperCase()}${transaction.status.slice(1)}` : ""}</small></span>
              <strong className={transaction.type === "cancellation_fee" ? "transaction-amount fee" : transaction.amount < 0 ? "transaction-amount debit" : "transaction-amount"}>{transaction.type === "cancellation_fee" ? `${formatNaira(Math.abs(transaction.amount))} fee` : `${transaction.amount < 0 ? "-" : "+"}${formatNaira(Math.abs(transaction.amount))}`}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function StudentWalletPage({
  wallet,
  onFund,
  onBack,
  onVerifyFunding,
}: {
  wallet: any;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onBack: () => void;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
}) {
  const [amount, setAmount] = useState("");
  const [fundingId, setFundingId] = useState<Id<"walletFundingRequests"> | null>(null);
  const [fundingState, setFundingState] = useState<"idle" | "loading">("idle");
  const [fundingMessage, setFundingMessage] = useState("");
  const transactions = (wallet?.transactions ?? []) as Array<{
    _id: string;
    amount: number;
    description: string;
    createdAt: number;
    type: string;
    status?: string;
    currency?: "NGN";
  }>;
  return (
    <section className="student-wallet-page">
      <button className="text-button wallet-back" type="button" onClick={onBack}>Back to dashboard</button>
      <div className="wallet-page-heading"><span className="eyebrow"><WalletCards size={14} /> A9 wallet</span><h2>Your wallet</h2><p>Manage your available balance and review your real wallet activity.</p></div>
      <div className="wallet-page-balance"><span className="eyebrow">Available balance</span><strong>{formatNaira(wallet?.balance ?? 0)}</strong><div className="student-wallet-funding-row"><input type="number" min="1" placeholder="Amount to add" value={amount} onChange={(event) => setAmount(event.target.value)} /><button className="wallet-action-primary" type="button" disabled={fundingState === "loading"} onClick={() => { setFundingState("loading"); setFundingMessage(""); void onFund(Number(amount)).then((result) => { setFundingId(result.fundingId); setFundingMessage("Checkout opened. Complete payment, then return to verify."); setAmount(""); }).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Unable to initialize payment. Please try again.")).finally(() => setFundingState("idle")); }}>{fundingState === "loading" ? "Initializing payment..." : "Add Money"}</button></div>{fundingMessage && <small className={fundingMessage.includes("opened") ? "payment-success" : "payment-error"}>{fundingMessage}</small>}{fundingId && <button className="secondary-button" type="button" onClick={() => void onVerifyFunding(fundingId).then(() => setFundingMessage("Wallet funding verified. Refreshing balance...")).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Payment is not verified yet."))}>Verify completed payment</button>}</div>
      <div className="wallet-page-transactions"><div className="student-wallet-activity-heading"><h3>All transactions</h3></div>{transactions.length === 0 ? <p className="student-wallet-empty">No wallet transactions yet.</p> : transactions.map((transaction) => <div className="student-wallet-transaction" key={transaction._id}><span className={transaction.amount < 0 ? "transaction-dot debit" : "transaction-dot"} /><span><strong>{transaction.description}</strong><small>{new Date(transaction.createdAt).toLocaleString()}{transaction.status ? ` · ${transaction.status[0].toUpperCase()}${transaction.status.slice(1)}` : ""}</small></span><strong className={transaction.type === "cancellation_fee" ? "transaction-amount fee" : transaction.amount < 0 ? "transaction-amount debit" : "transaction-amount"}>{transaction.type === "cancellation_fee" ? `${formatNaira(Math.abs(transaction.amount))} fee` : `${transaction.amount < 0 ? "-" : "+"}${formatNaira(Math.abs(transaction.amount))}`}</strong></div>)}</div>
    </section>
  );
}

function StudentBookingPage({
  wallet,
  onFund,
  onVerifyFunding,
  onBook,
}: {
  wallet: any;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
  onBook: (args: any) => Promise<Id<"rides">>;
}) {
  const ensureLocations = useMutation(api.rides.ensureLocations);
  const locationRecords = (useQuery(api.rides.listSchoolLocations) ?? []) as LocationRecord[];
  const schoolLocations = locationRecords.flatMap((location) => {
    const group = locationGroups.find((candidate) => candidate.slugs.includes(location.slug ?? ""));
    if (!group) return [];
    return [{ ...location, group: group.id, groupLabel: group.label }];
  });
  const [pickup, setPickup] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [searchError, setSearchError] = useState("");
  const [pickupSearch, setPickupSearch] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [customLocations, setCustomLocations] = useState({
    pickup: { name: "", city: "", state: "" },
    destination: { name: "", city: "", state: "" },
  });
  const [openSelector, setOpenSelector] = useState<"pickup" | "destination" | null>(null);
  const [bookingStep, setBookingStep] = useState<"details" | "review">("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rideRequested, setRideRequested] = useState(false);
  const [bookingReference, setBookingReference] = useState(() => crypto.randomUUID());
  const [createdRideId, setCreatedRideId] = useState<Id<"rides"> | null>(null);
  const studentRides = normalizeDashboardRides(useQuery(api.rides.listMyRides));
  const liveRide = createdRideId
    ? studentRides.find((ride) => ride._id === createdRideId) ?? null
    : null;

  useEffect(() => { void ensureLocations({}); }, [ensureLocations]);

  const chooseLocation = (kind: "pickup" | "destination", location: Location) => {
    if (kind === "pickup") {
      if (destination && locationIdentity(location) === locationIdentity(destination)) return;
      setPickup(location);
    } else {
      if (pickup && locationIdentity(location) === locationIdentity(pickup)) return;
      setDestination(location);
    }
    setOpenSelector(null);
    setSearchError("");
  };

  const filteredLocations = (value: string) => schoolLocations.filter((location) => location.name.toLowerCase().includes(value.trim().toLowerCase()));

  const continueBooking = () => {
    if (!pickup || !destination || locationIdentity(pickup) === locationIdentity(destination)) return;
    setRideRequested(false);
    setBookingStep("review");
  };

  const confirmRideRequest = async () => {
    if (!pickup || !destination) return;
    setIsSubmitting(true);
    try {
      const rideId = await onBook({
        ...(pickup._id
          ? { pickupLocationId: pickup._id }
          : { pickup: rideLocationInput(pickup) }),
        ...(destination._id
          ? { destinationLocationId: destination._id }
          : { destination: rideLocationInput(destination) }),
        bookingReference,
      });
      setCreatedRideId(rideId);
      setRideRequested(true);
      setBookingReference(crypto.randomUUID());
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Ride request could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="booking-page">
      <div className="section-heading booking-header">
        <div>
          <span className="eyebrow">Book a ride</span>
          <h2>Where are you going today?</h2>
        </div>
        <Wallet wallet={wallet} onFund={onFund} onVerifyFunding={onVerifyFunding} />
      </div>

      {rideRequested ? (
        <div className="success-card">
          <div className="success-icon">✓</div>
          <h3>{liveRide?.requestStatus === "booked" ? "Rider selected" : liveRide?.requestStatus === "expired" ? "Ride request expired" : "Ride request sent"}</h3>
          <p>
            {liveRide?.requestStatus === "booked"
              ? "Your rider is assigned. The agreed fare is held securely until the ride is completed."
              : liveRide?.requestStatus === "expired"
                ? "The request window ended. You can create a new ride request."
                : `Available riders can join a negotiation for your trip from ${locationLabel(pickup)} to ${locationLabel(destination)}.`}
          </p>
          {liveRide && (
            <div className="ride-live-summary">
              <span>Live status</span>
              <strong>{liveRide.requestStatus === "booked" ? "Rider selected" : liveRide.requestStatus === "expired" ? "Request expired" : "Waiting for price offers"}</strong>
              {liveRide.requestStatus === "booked" && <><span>Accepted fare</span><strong>{formatNaira(liveRide.agreedFare ?? liveRide.fare ?? 0)}</strong></>}
              <span>Request expires</span>
              <strong>{formatNigerianTime(liveRide.expiresAt)}</strong>
            </div>
          )}
          {searchError && <p className="payment-error" role="alert">{searchError}</p>}
          {liveRide?.status === "negotiating" && <NegotiationRoom ride={liveRide} role="student" walletBalance={wallet?.balance} />}
          <button className="secondary-button" type="button" onClick={() => { setBookingStep("details"); setRideRequested(false); setCreatedRideId(null); setSearchError(""); }}>
            Book another trip
          </button>
        </div>
      ) : bookingStep === "review" ? (
        <div className="review-card">
          <div className="section-heading compact-heading">
            <div>
              <span className="eyebrow">Confirm trip</span>
              <h3>Review your ride request</h3>
            </div>
          </div>
          <div className="review-grid">
            <div className="review-stack">
              <div className="detail-row">
                <span>Pickup</span>
                <strong>{locationLabel(pickup)}</strong>
              </div>
              <div className="detail-row">
                <span>Destination</span>
                <strong>{locationLabel(destination)}</strong>
              </div>
            </div>
            <div className="selected-rider-card">
              <strong>Negotiate directly with your rider</strong>
              <p>No fare is calculated in advance. You will exchange prices in a live negotiation room, and payment is held only after you accept the final price.</p>
            </div>
          </div>
          <div className="review-actions">
            {searchError && <p className="payment-error" role="alert">{searchError}</p>}
            <button
              className="secondary-button"
              onClick={() => setBookingStep("details")}
              type="button"
            >
              Edit trip
            </button>
            <button
              className="primary-button"
              onClick={confirmRideRequest}
              disabled={isSubmitting}
              type="button"
            >
              {isSubmitting ? "Sending request..." : "Send ride request"} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className="booking-layout">
          <div className="booking-card booking-form-card">
            <div className="school-location-stack">
              {(["pickup", "destination"] as const).map((kind) => {
                const selected = kind === "pickup" ? pickup : destination;
                const searchValue = kind === "pickup" ? pickupSearch : destinationSearch;
                const setSearchValue = kind === "pickup" ? setPickupSearch : setDestinationSearch;
                const otherLocation = kind === "pickup" ? destination : pickup;
                const customLocation = customLocations[kind];
                const setCustomField = (field: "name" | "city" | "state", value: string) =>
                  setCustomLocations((current) => ({ ...current, [kind]: { ...current[kind], [field]: value } }));
                const options = filteredLocations(searchValue).filter((location) =>
                  !otherLocation || locationIdentity(location) !== locationIdentity(otherLocation),
                );
                return <div className={`school-location-selector ${openSelector === kind ? "open" : ""}`} key={kind}>
                  <label>{kind === "pickup" ? "Pickup location" : "Destination"}</label>
                  <button type="button" className="school-location-trigger" onClick={() => setOpenSelector(openSelector === kind ? null : kind)}>
                    <MapPin size={17} /><span>{selected ? locationLabel(selected) : `Choose ${kind} location`}</span><ChevronDown size={17} />
                  </button>
                  {openSelector === kind && <div className="school-location-menu">
                    <div className="school-location-search"><Search size={16} /><input autoFocus value={searchValue} placeholder={`Search ${kind} location`} onChange={(event) => setSearchValue(event.target.value)} /></div>
                    <div className="school-location-options">{locationGroups.map((group) => {
                      const groupLocations = options.filter((location) => location.group === group.id);
                      if (groupLocations.length === 0) return null;
                      return <section className="school-location-group" key={group.id}><h4 className="school-location-group-title">{group.label}</h4>{groupLocations.map((location) => <button type="button" key={location.slug ?? location._id} className={selected?.slug === location.slug ? "selected" : ""} onClick={() => chooseLocation(kind, location)}><MapPin size={15} /><span>{location.name}</span></button>)}</section>;
                    })}{options.length === 0 && <small>No matching A9 location.</small>}</div>
                    <div className="nationwide-location-form">
                      <strong>Or enter any Nigerian location</strong>
                      <input aria-label={`${kind} address or place`} value={customLocation.name} placeholder="Address or place name" onChange={(event) => setCustomField("name", event.target.value)} />
                      <div>
                        <input aria-label={`${kind} city`} value={customLocation.city} placeholder="City" onChange={(event) => setCustomField("city", event.target.value)} />
                        <input aria-label={`${kind} state`} value={customLocation.state} placeholder="State" onChange={(event) => setCustomField("state", event.target.value)} />
                      </div>
                      <button type="button" disabled={!customLocation.name.trim() || !customLocation.city.trim() || !customLocation.state.trim()} onClick={() => chooseLocation(kind, { ...customLocation })}>
                        Use this location
                      </button>
                    </div>
                  </div>}
                </div>;
              })}
            </div>
            {searchError && <small className="location-note location-note--unavailable">{searchError}</small>}
            <button
              type="button"
              className="primary-button full"
              onClick={continueBooking}
              disabled={!pickup || !destination || locationIdentity(pickup) === locationIdentity(destination)}
            >
              Review ride request <ArrowRight size={18} />
            </button>

            <small className="location-note">Where are you going? Choose a campus stop or enter an address and city anywhere in Nigeria.</small>
          </div>
        </div>
      )}
    </div>
  );
}

function Wallet({
  wallet,
  onFund,
  onVerifyFunding,
}: {
  wallet: any;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onVerifyFunding?: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [fundingState, setFundingState] = useState<"idle" | "loading">("idle");
  const [fundingMessage, setFundingMessage] = useState("");
  const [fundingId, setFundingId] = useState<Id<"walletFundingRequests"> | null>(null);
  return (
    <div className="wallet-card">
      <span className="eyebrow">Wallet balance</span>
      <strong>{formatNaira(wallet?.balance ?? 0)}</strong>
      <button className="secondary-button" onClick={() => setOpen(!open)}>
        <WalletCards size={15} /> Fund wallet
      </button>
      {open && (
        <div className="funding-panel">
          <p>Secure wallet funding via Paystack. Your balance updates only after verified payment.</p>
          <input
            type="number"
            min="1"
            placeholder="Amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button className="primary-button" disabled={fundingState === "loading"} onClick={() => { setFundingState("loading"); setFundingMessage(""); void onFund(Number(amount)).then((result) => { setFundingId(result.fundingId); setFundingMessage("Checkout opened. Complete payment, then verify it here."); }).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Unable to initialize payment. Please try again.")).finally(() => setFundingState("idle")); }}>
            {fundingState === "loading" ? "Initializing payment..." : "Request"}
          </button>
          {fundingMessage && <p className={fundingMessage.includes("opened") ? "payment-success" : "payment-error"}>{fundingMessage}</p>}
          {fundingId && onVerifyFunding && <button className="secondary-button" type="button" onClick={() => void onVerifyFunding(fundingId).then(() => setFundingMessage("Wallet funding verified. Refreshing balance...")).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Payment is not verified yet."))}>Verify completed payment</button>}
        </div>
      )}
    </div>
  );
}
function RiderDashboard({
  account,
  requests,
  assignedRides,
  ratingSummary,
  earnings,
  payoutHistory,
  onAccept,
  onDecline,
  onStatus,
  onToggleAvailability,
  onOpenVerification,
  onRequestPayout,
}: {
  account: any;
  requests: Ride[];
  rides: Ride[];
  assignedRides: Ride[];
  ratingSummary: { averageRating: number; ratingCount: number } | null | undefined;
  earnings: any;
  payoutHistory: Array<any>;
  onAccept: (id: Id<"rides">) => Promise<void>;
  onDecline: (id: Id<"rides">) => Promise<void>;
  onStatus: (id: Id<"rides">, status: Status) => void;
  onToggleAvailability: (isOnline: boolean) => void;
  onOpenVerification: () => void;
  onRequestPayout: (earningsId: Id<"riderEarnings">) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }>;
}) {
  const myOffers = useQuery(api.marketplace.listMyRideOffers) ?? [];
  const status = (account.verificationStatus ?? "not_verified") as VerificationStatus;
  const isOnline = account.isOnline === true;
  const activeRide = assignedRides.find((ride) => ["negotiating", "accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(ride.status));
  const completedRides = assignedRides.filter((ride) => ride.status === "completed");
  const totalEarnings = earnings?.total ?? 0;
  const todayEarnings = earnings?.today ?? 0;
  const availableForPayout = earnings?.availableForPayout ?? 0;
  const pendingEarnings = earnings?.pending ?? 0;
  const paidOut = earnings?.paid ?? 0;
  const recentCompleted = completedRides.slice(0, 3);
  const historyEntries = earnings?.history ?? [];
  const payoutEntries = payoutHistory ?? [];
  const [expandEarnings, setExpandEarnings] = useState(false);
  const [expandPayouts, setExpandPayouts] = useState(false);
  const visibleEarnings = expandEarnings ? historyEntries : historyEntries.slice(0, 5);
  const visiblePayouts = expandPayouts ? payoutEntries : payoutEntries.slice(0, 5);

  return (
    <div className="rider-dashboard rider-dashboard--command">
      <header className="rider-command-header">
        <div className="rider-command-identity"><span className="rider-command-avatar">{account.name?.slice(0, 2).toUpperCase() ?? "A9"}</span><div><span className="eyebrow">A9 Rider</span><h1>Good to see you, {account.name ?? "Rider"} <span className="rider-wave" aria-hidden="true">👋</span></h1><p><ShieldCheck size={13} /> {status === "approved" ? "Verified rider" : status === "under_review" ? "Verification under review" : status === "rejected" ? "Verification rejected" : "Verification required"} <span className="rider-header-dot" /> {isOnline ? "Ready for Pickup" : "Offline"}</p></div></div>
        <button className={isOnline ? "availability-control online" : "availability-control"} type="button" onClick={() => onToggleAvailability(!isOnline)}><span />{isOnline ? "Go Offline" : "Go Online"}</button>
      </header>

      {status !== "approved" && (
        <div className="verification-status-banner">
          <div>
            <strong>{status === "under_review" ? "Verification Submitted" : status === "rejected" ? "Verification Rejected" : "Not Verified"}</strong>
            <p>{status === "under_review" ? "Your account is being reviewed and cannot accept rides yet." : status === "rejected" ? "Update your documents and resubmit to regain access." : "Complete verification to start accepting rides on A9."}</p>
          </div>
          <button className="primary-button" type="button" onClick={onOpenVerification}>{status === "rejected" ? "Resubmit Verification" : "Verify Account"}</button>
        </div>
      )}

      {historyEntries[0] && <div className="ride-payment-confirmed rider-settlement-notice"><strong>Latest ride settlement</strong><span>{formatNaira(historyEntries[0].riderEarnings)} credited to A9 earnings · {formatNigerianDateTime(historyEntries[0].completedAt)}</span></div>}

      <section className={isOnline ? "rider-command-status online" : "rider-command-status"}><div><span className="eyebrow">Pickup status</span><strong>{isOnline ? "Ready for Pickup" : "Offline"}</strong><p>{isOnline ? "You are visible for new ride requests." : "Go online when you are ready to receive requests."}</p></div><div className="rider-status-aside"><div className="rider-rating-summary"><Star size={16} fill="currentColor" /><strong>{ratingSummary?.ratingCount ? ratingSummary.averageRating.toFixed(1) : "New"}</strong><span>{ratingSummary?.ratingCount ?? 0} ratings</span></div><button className="rider-status-action" type="button" onClick={() => onToggleAvailability(!isOnline)}>{isOnline ? "Go Offline" : "Go Online"} <ArrowRight size={17} /></button></div></section>

      <div className="rider-command-grid">
        <main className="rider-command-primary">
          <section className="rider-command-panel rider-command-ride-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">{activeRide?.status === "negotiating" ? "Negotiation room" : activeRide ? "On the move" : "Live requests"}</span><h2>{activeRide?.status === "negotiating" ? "Negotiate fare" : activeRide ? "Active ride" : "Incoming requests"}</h2></div>{!activeRide && requests.length > 0 && <span className="rider-request-count">{requests.length} available</span>}</div>{activeRide ? <RiderActiveRide ride={activeRide} onStatus={onStatus} /> : requests.length ? <div className="rider-request-list">{requests.map((ride) => <RiderRequestCard key={ride._id} ride={ride} onAccept={onAccept} onDecline={onDecline} />)}</div> : <RiderEmptyState title={isOnline ? "No requests right now" : "You are offline"} message={isOnline ? "New requests will appear here in real time." : "Go online to receive your next request."} />}</section>
          {myOffers.length > 0 && <section className="rider-command-panel rider-recent-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">Your offers</span><h2>Offer activity</h2></div></div><div className="rider-recent-list">{myOffers.slice(0, 8).map((offer) => <div className="rider-recent-row" key={offer._id}><span className="rider-recent-icon"><Clock3 size={15} /></span><span><strong>{offer.pickupLabel ?? "Ride request"} <em>to</em> {offer.destinationLabel ?? "Unavailable"}</strong><small>{offer.status === "submitted" ? "Waiting for customer selection" : offer.status[0].toUpperCase() + offer.status.slice(1)}</small></span><strong>{formatNaira(offer.fare)}</strong></div>)}</div></section>}
          <section className="rider-command-panel rider-recent-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">Trip history</span><h2>Recent rides</h2></div><span className="rider-view-label">{recentCompleted.length > 0 ? "Latest" : "Empty"}</span></div>{recentCompleted.length > 0 ? <div className="rider-recent-list">{recentCompleted.map((ride) => <div className="rider-recent-row" key={ride._id}><span className="rider-recent-icon"><Check size={15} /></span><span><strong>{ride.pickupLabel} <em>to</em> {ride.destinationLabel}</strong><small>{new Date(ride.requestedAt).toLocaleDateString()}</small></span>          <strong>{formatNaira(ride.agreedFare ?? ride.fare ?? 0)}</strong></div>)}</div> : <RiderEmptyState title="No completed rides yet" message="Your ride history will appear here after your first trip." />}</section>
        </main>
        <aside className="rider-command-side">
          <section className="rider-command-panel rider-confidence-panel"><span className="rider-safety-icon"><ShieldCheck size={18} /></span><div><strong>Drive with confidence</strong><p>Your rider account is verified for the A9 network.</p></div></section>
          <section className="rider-command-panel rider-finance-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">Performance</span><h2>Financial overview</h2></div><span className="rider-earnings-mark">₦</span></div><div className="rider-hero-earning">{formatNaira(todayEarnings)}<small>today</small></div><div className="rider-earnings-periods"><div><span>Total earnings</span><strong>{formatNaira(totalEarnings)}</strong></div><div><span>Available for payout</span><strong>{formatNaira(availableForPayout)}</strong></div><div><span>Pending earnings</span><strong>{formatNaira(pendingEarnings)}</strong></div><div><span>Paid out</span><strong>{formatNaira(paidOut)}</strong></div></div><RiderPayoutRequestCard available={availableForPayout} eligibleEarnings={historyEntries.filter((entry: any) => entry.status === "eligible")} onRequestPayout={onRequestPayout} account={account} /><div className="rider-finance-groups"><div className="rider-finance-group"><div className="rider-finance-header"><span className="eyebrow">Ledger</span><h3>Earnings history</h3></div>{historyEntries.length ? <div className="rider-history-list">{visibleEarnings.map((entry: any) => <div className="rider-earning-row" key={entry._id}><div><strong>Ride {String(entry.rideId).slice(-7)}</strong><small>{new Date(entry.completedAt).toLocaleDateString()} · Fare ₦{entry.grossFare.toLocaleString()} · Fee ₦{entry.platformFee.toLocaleString()}</small></div><span><strong>₦{entry.riderEarnings.toLocaleString()}</strong><small>{entry.status === "eligible" ? "Eligible" : entry.status[0].toUpperCase() + entry.status.slice(1)}</small></span></div>)}</div> : <p className="settings-muted">Completed paid rides will appear here.</p>}{historyEntries.length > 5 && <button className="rider-see-more" type="button" onClick={() => setExpandEarnings((value) => !value)}>{expandEarnings ? "Show less" : "See more"}</button>}</div><div className="rider-finance-group"><div className="rider-finance-header"><span className="eyebrow">Payout</span><h3>Payout history</h3></div>{payoutEntries.length ? <div className="rider-history-list">{visiblePayouts.map((entry: any) => <div className="rider-earning-row" key={entry._id}><div><strong>{formatNaira(entry.amount)}</strong><small>{new Date(entry.requestedAt ?? entry.createdAt).toLocaleDateString()}</small></div><span><strong>{entry.status}</strong><small>{entry.reference.slice(-8)}</small></span></div>)}</div> : <p className="settings-muted">No payout requests yet.</p>}{payoutEntries.length > 5 && <button className="rider-see-more" type="button" onClick={() => setExpandPayouts((value) => !value)}>{expandPayouts ? "Show less" : "See more"}</button>}</div></div><div className="rider-compact-stats"><div><strong>{earnings?.completedRides ?? 0}</strong><span>Completed rides</span></div><div><strong>{formatNaira(earnings?.week ?? 0)}</strong><span>This week</span></div><div><strong>{formatNaira(earnings?.month ?? 0)}</strong><span>This month</span></div><div><strong>NGN</strong><span>Currency</span></div></div></section>
        </aside>
      </div>
    </div>
  );
}

function RiderSectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="rider-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>;
}

function RiderRequestCard({ ride, onAccept, onDecline }: { ride: Ride; onAccept: (id: Id<"rides">) => Promise<void>; onDecline: (id: Id<"rides">) => Promise<void> }) {
  const startNegotiation = useMutation(api.rides.startNegotiation);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [offerError, setOfferError] = useState("");
  const serverOffset = useRef(ride.serverNow - Date.now());
  useEffect(() => {
    serverOffset.current = ride.serverNow - Date.now();
    const updateClock = () => setNow(Date.now());
    const timer = window.setInterval(updateClock, 1000);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, [ride.serverNow, ride.expiresAt]);
  const remainingMs = Math.max(0, ride.expiresAt - (now + serverOffset.current));
  const expired = remainingMs === 0;
  const countdown = `${String(Math.floor(remainingMs / 60_000)).padStart(2, "0")}:${String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0")}`;
  const accept = async () => {
    if (expired || busy) return;
    setBusy(true);
    try {
      await onAccept(ride._id);
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    if (expired || busy) return;
    setBusy(true);
    try {
      await onDecline(ride._id);
    } finally {
      setBusy(false);
    }
  };
  const joinNegotiation = async () => {
    if (expired || busy) return;
    setBusy(true);
    setOfferError("");
    try {
      await startNegotiation({ rideId: ride._id });
    } catch (error) {
      setOfferError(error instanceof Error ? error.message : "Could not join the negotiation.");
    } finally {
      setBusy(false);
    }
  };
  return <article className={expired ? "rider-request-card expired" : "rider-request-card"}><div className="rider-request-top"><span className="ride-status-pill"><span />{ride.requestStatus ? "Open negotiation" : "New request"}</span><strong>{ride.requestStatus ? "Price set together" : ride.fare === undefined ? "Fare not set" : formatNaira(ride.fare)}</strong></div><div className="rider-request-route"><div><small>Pickup</small><strong>{ride.pickupLabel}</strong></div><ArrowRight size={17} /><div><small>Destination</small><strong>{ride.destinationLabel}</strong></div></div><div className="rider-request-meta"><span><Clock3 size={14} /> {new Date(ride.requestedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className={expired ? "rider-request-countdown expired" : "rider-request-countdown"}><Clock3 size={14} /> {expired ? "Request expired" : `Respond within ${countdown}`}</span></div>{ride.requestStatus ? <div className="rider-request-actions"><button className="primary-button" type="button" onClick={() => void joinNegotiation()} disabled={busy || expired}>{expired ? "Expired" : busy ? "Joining..." : "Join negotiation"} <ArrowRight size={16} /></button></div> : <div className="rider-request-actions"><button className="secondary-button" type="button" onClick={() => void decline()} disabled={busy || expired}>Decline</button><button className="primary-button" type="button" onClick={() => void accept()} disabled={busy || expired}>{expired ? "Expired" : busy ? "Accepting..." : "Accept Ride"} {!expired && <Check size={16} />}</button></div>}{offerError && <p className="payment-error" role="alert">{offerError}</p>}</article>;
}

function RiderActiveRide({ ride, onStatus }: { ride: Ride; onStatus: (id: Id<"rides">, status: Status) => void }) {
  if (ride.status === "negotiating") return <NegotiationRoom ride={ride} role="rider" />;
  const nextStatus: Status | null = ride.status === "accepted" ? "rider_arriving" : ride.status === "rider_arriving" ? "in_progress" : ride.status === "in_progress" ? "awaiting_confirmation" : null;
  const nextLabel = ride.status === "accepted" ? "Start arrival" : ride.status === "rider_arriving" ? "Start ride" : "Complete Ride";
  const paymentConfirmed =
    ride.paymentStatus === "paid" ||
    ride.paymentStage === "paid_held" ||
    ride.paymentStage === "awaiting_completion" ||
    ride.paymentStage === "eligible_for_rider" ||
    ride.paymentStage === "pending_payout" ||
    ride.paymentStage === "paid_to_rider";
  const paymentBlocked = nextStatus !== null && !paymentConfirmed;
  return <div className="rider-active-card"><div className="rider-request-top"><span className="ride-status-pill"><span />{rideStatusLabel(ride)}</span><strong>{formatNaira(ride.agreedFare ?? ride.fare ?? 0)}</strong></div><div className="rider-active-route"><div><small>Customer</small><strong>{ride.studentName ?? "Customer"}</strong></div><ArrowRight size={18} /><div><small>Destination</small><strong>{ride.destinationLabel ?? "Destination unavailable"}</strong></div></div><div className={paymentConfirmed ? "ride-payment-confirmed" : "ride-payment-required"}><strong>{paymentConfirmed ? "Payment Confirmed" : "Payment Required"}</strong><span>{paymentConfirmed ? `${formatNaira(ride.paymentAmount ?? ride.agreedFare ?? ride.fare ?? 0)} secured by A9` : "Customer payment has not been confirmed."}</span></div><div className="rider-active-footer"><span>{ride.status === "awaiting_confirmation" ? "Waiting for Customer Confirmation" : paymentBlocked ? "Payment must be confirmed before the ride can proceed" : "Payment secured · Ready for trip"}</span>{nextStatus && <button className="primary-button" type="button" onClick={() => onStatus(ride._id, nextStatus)} disabled={paymentBlocked}>{paymentBlocked ? "Payment required" : <>{nextLabel} <ArrowRight size={16} /></>}</button>}</div></div>;
}

function RiderPayoutRequestCard({ available, eligibleEarnings, onRequestPayout, account }: { available: number; eligibleEarnings: Array<{ _id: Id<"riderEarnings">; rideId: Id<"rides">; riderEarnings: number }>; onRequestPayout: (earningsId: Id<"riderEarnings">) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }>; account: any; }) {
  const [open, setOpen] = useState(false);
  const [earningId, setEarningId] = useState<Id<"riderEarnings"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const bank = account.payoutBankName ?? "Not set";
  const accountNumber = account.payoutAccountNumber ?? "Not set";
  const accountName = account.payoutAccountName ?? "Not set";
  const selectedEarning = eligibleEarnings.find((earning) => earning._id === earningId) ?? eligibleEarnings[0];
  return (
    <div className="rider-payout-card">
      <div className="rider-payout-header"><span className="eyebrow">Cash out</span><strong>{formatNaira(available)}</strong></div>
      {open ? (
        <div className="rider-payout-panel">
          <div className="rider-payout-row"><span>Available balance</span><strong>{formatNaira(available)}</strong></div>
          <label><span>Ride earning to withdraw</span><select value={selectedEarning?._id ?? ""} onChange={(event) => setEarningId(event.target.value as Id<"riderEarnings">)}>{eligibleEarnings.map((earning) => <option key={earning._id} value={earning._id}>Ride {String(earning.rideId).slice(-7)} · {formatNaira(earning.riderEarnings)}</option>)}</select></label>
          <small className="settings-muted">Each request covers one completed ride. Submit separate requests for other ride earnings.</small>
          <div className="rider-payout-row"><span>Registered bank</span><strong>{bank}</strong></div>
          <div className="rider-payout-row"><span>Account</span><strong>{accountNumber ? `****${String(accountNumber).slice(-4)}` : "Not set"}</strong></div>
          {message && <p className="settings-feedback success">{message}</p>}
          <button className="primary-button" type="button" disabled={!selectedEarning || !available || busy} onClick={async () => { setBusy(true); setMessage(""); try { await onRequestPayout(selectedEarning!._id); setMessage("Payout request submitted. Admin review is pending."); setOpen(false); } catch (error) { setMessage(error instanceof Error ? error.message : "Payout request could not be created."); } finally { setBusy(false); } }}>{busy ? "Submitting..." : "Request Payout"}</button>
        </div>
      ) : (
        <button className="secondary-button" type="button" disabled={!available} onClick={() => setOpen(true)}>{available > 0 ? "Request Payout" : "No funds available"}</button>
      )}
      {!account.payoutBankName && <p className="settings-muted">Add your payout account in Account settings before requesting a payout.</p>}
      {account.payoutBankName && <small className="settings-muted">{accountName} · {bank} · ****{String(accountNumber).slice(-4)}</small>}
    </div>
  );
}

function RiderMetric({ label, value }: { label: string; value: string }) { return <div className="rider-metric"><span>{label}</span><strong>{value}</strong></div>; }

function RiderEmptyState({ title, message }: { title: string; message: string }) { return <div className="rider-empty-state"><span><Bike size={22} /></span><div><h3>{title}</h3><p>{message}</p></div></div>; }

function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  const meta: Record<VerificationStatus, { label: string; tone: string }> = {
    not_verified: { label: "Not Verified", tone: "neutral" },
    under_review: { label: "Under Review", tone: "warning" },
    approved: { label: "Verified", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
  };
  return <span className={`verification-badge verification-badge--${meta[status].tone}`}>{meta[status].label}</span>;
}

function VerificationPrompt({ onVerify, onLater }: { onVerify: () => void; onLater: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="verification-modal">
        <span className="eyebrow"><ShieldCheck size={14} /> Rider verification</span>
        <h3>Verify Your Account</h3>
        <p>Complete your verification to start accepting rides on A9.</p>
        <div className="verification-modal-actions">
          <button className="primary-button" type="button" onClick={onVerify}>Verify Account</button>
          <button className="secondary-button" type="button" onClick={onLater}>I&apos;ll Do This Later</button>
        </div>
      </div>
    </div>
  );
}

function VerificationRequiredModal({ onVerify, onClose }: { onVerify: () => void; onClose: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="verification-modal">
        <span className="eyebrow"><ShieldCheck size={14} /> Account access</span>
        <h3>Account Verification Required</h3>
        <p>Please complete and receive approval for your account verification before accepting rides.</p>
        <div className="verification-modal-actions">
          <button className="primary-button" type="button" onClick={onVerify}>Verify Account</button>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function VerificationPage({
  account,
  onBack,
  onUpload,
  onSubmit,
}: {
  account: any;
  onBack: () => void;
  onUpload: (file: File) => Promise<Id<"_storage">>;
  onSubmit: (args: {
    idType: "national_id" | "voters_card" | "passport";
    idNumber: string;
    idDocument: Id<"_storage">;
    selfie: Id<"_storage">;
    dateOfBirth: string;
    address: string;
    emergencyName: string;
    emergencyPhone: string;
  }) => Promise<unknown>;
}) {
  const status = (account.verificationStatus ?? "not_verified") as VerificationStatus;
  const [form, setForm] = useState({
    idType: account.verificationIdType ?? "national_id",
    idNumber: account.verificationIdNumber ?? "",
    dateOfBirth: account.verificationDateOfBirth ?? "",
    address: account.verificationAddress ?? "",
    emergencyName: account.verificationEmergencyName ?? "",
    emergencyPhone: account.verificationEmergencyPhone ?? "",
  });
  const [idDocumentId, setIdDocumentId] = useState<Id<"_storage"> | null>(account.verificationIdDocument ?? null);
  const [selfieId, setSelfieId] = useState<Id<"_storage"> | null>(account.verificationSelfie ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  };

  const uploadFile = async (key: "idDocument" | "selfie", file: File | undefined) => {
    if (!file) return;
    setIsUploading(true);
    setError("");
    try {
      const storageId = await onUpload(file);
      if (key === "idDocument") setIdDocumentId(storageId);
      else setSelfieId(storageId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "File upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!idDocumentId || !selfieId) {
      setError("Upload your government-issued ID and a selfie before submitting.");
      return;
    }
    if (!form.idNumber.trim() || !form.dateOfBirth || !form.address.trim() || !form.emergencyName.trim()) {
      setError("Complete all required verification fields.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await onSubmit({
        idType: form.idType as "national_id" | "voters_card" | "passport",
        idNumber: form.idNumber.trim(),
        idDocument: idDocumentId,
        selfie: selfieId,
        dateOfBirth: form.dateOfBirth,
        address: form.address.trim(),
        emergencyName: form.emergencyName.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
      });
      setSuccess("Verification Submitted");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification could not be submitted.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = status === "under_review" || status === "approved";
  const hasRejected = status === "rejected";

  return (
    <section className="verification-page">
      <div className="verification-header">
        <button className="text-button" type="button" onClick={onBack}>Back to dashboard</button>
        <div className="verification-title-wrap">
          <span className="eyebrow"><ShieldCheck size={14} /> Rider verification</span>
          <h1>Verify your identity</h1>
        </div>
        <VerificationStatusBadge status={status} />
      </div>

      {status === "under_review" && (
        <div className="verification-state-card verification-state-card--info">
          <div className="verification-state-icon"><Clock3 size={20} /></div>
          <div>
            <strong>Verification Submitted</strong>
            <p>Your verification information has been submitted successfully. Our team will review your account and notify you once a decision has been made.</p>
          </div>
        </div>
      )}

      {status === "approved" && (
        <div className="verification-state-card verification-state-card--success">
          <div className="verification-state-icon"><CheckCircle2 size={20} /></div>
          <div>
            <strong>Verified</strong>
            <p>Your account has been approved and you can now accept ride requests.</p>
          </div>
        </div>
      )}

      {status === "rejected" && (
        <div className="verification-state-card verification-state-card--danger">
          <div className="verification-state-icon"><X size={20} /></div>
          <div>
            <strong>Verification Rejected</strong>
            <p>{account.verificationRejectionReason ? `Reason: ${account.verificationRejectionReason}` : "Please review your information and resubmit."}</p>
          </div>
        </div>
      )}

      {success && <div className="verification-success-message">{success}</div>}
      {error && <div className="verification-error-message" role="alert">{error}</div>}

      <form className="verification-form" onSubmit={handleSubmit}>
        <div className="verification-grid">
          <section className="verification-panel">
            <h2>Personal Information</h2>
            <div className="verification-fields">
              <label><span>Full Name</span><input value={account.name ?? ""} readOnly /></label>
              <label><span>Phone Number</span><input value={account.phone ?? ""} readOnly /></label>
              <label><span>Email</span><input value={account.email ?? ""} readOnly /></label>
              <label><span>Date of Birth</span><input type="date" value={form.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} disabled={isDisabled} /></label>
              <label className="full-width"><span>Address</span><input value={form.address} onChange={(event) => updateField("address", event.target.value)} placeholder="Enter your residential address" disabled={isDisabled} /></label>
              <label><span>Emergency Contact Name</span><input value={form.emergencyName} onChange={(event) => updateField("emergencyName", event.target.value)} placeholder="Full name" disabled={isDisabled} /></label>
              <label><span>Emergency Contact Phone Number</span><input value={form.emergencyPhone} onChange={(event) => updateField("emergencyPhone", event.target.value)} placeholder="08012345678" disabled={isDisabled} /></label>
            </div>
          </section>

          <section className="verification-panel">
            <h2>Identity Verification</h2>
            <div className="verification-fields">
              <label>
                <span>Government-issued ID type</span>
                <select value={form.idType} onChange={(event) => updateField("idType", event.target.value)} disabled={isDisabled}>
                  <option value="national_id">National ID / NIN</option>
                  <option value="voters_card">Voter&apos;s card</option>
                  <option value="passport">International Passport</option>
                </select>
              </label>
              <label><span>ID number</span><input value={form.idNumber} onChange={(event) => updateField("idNumber", event.target.value)} placeholder="Enter your ID number" disabled={isDisabled} /></label>
              <label className="verification-file-field">
                <span>Government-issued ID</span>
                <div className="upload-box">
                  <Upload size={18} />
                  <span>{idDocumentId ? "Government ID uploaded" : "Upload ID document"}</span>
                  <input type="file" accept="image/*,.pdf" onChange={(event) => void uploadFile("idDocument", event.target.files?.[0])} disabled={isDisabled || isUploading} />
                </div>
              </label>
              <label className="verification-file-field">
                <span>Selfie / face photo</span>
                <div className="upload-box">
                  <FileText size={18} />
                  <span>{selfieId ? "Selfie uploaded" : "Upload selfie"}</span>
                  <input type="file" accept="image/*" onChange={(event) => void uploadFile("selfie", event.target.files?.[0])} disabled={isDisabled || isUploading} />
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="verification-footer">
          <span className="verification-help">Your identity information is stored privately and is only reviewed by A9 staff.</span>
          {status === "approved" ? null : (
            <button className="primary-button" type="submit" disabled={isDisabled || isSubmitting || isUploading}>
              {isSubmitting ? "Submitting..." : hasRejected ? "Resubmit Verification" : status === "under_review" ? "Under Review" : "Submit Verification"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function Settings({
  account,
  updateProfile,
  changePassword,
  signOut,
}: {
  account: any;
  updateProfile: any;
  changePassword: any;
  signOut: () => void;
}) {
  const [name, setName] = useState(account.name ?? "");
  const [phone, setPhone] = useState(account.phone ?? "");
  const [vehicle, setVehicle] = useState(account.vehicle ?? "");
  const [plateNumber, setPlateNumber] = useState(account.plateNumber ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [payoutBankName, setPayoutBankName] = useState(account.payoutBankName ?? "");
  const [payoutBankCode, setPayoutBankCode] = useState(account.payoutBankCode ?? "");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState(account.payoutAccountNumber ?? "");
  const [payoutAccountName, setPayoutAccountName] = useState(account.payoutAccountName ?? "");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [locationAccess, setLocationAccess] = useState("Checking browser permission...");
  const isStudent = account.role === "student";

  useEffect(() => {
    let mounted = true;
    if (!navigator.permissions?.query) {
      setLocationAccess("Browser permission status is unavailable");
      return () => { mounted = false; };
    }
    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (!mounted) return;
      const update = () => setLocationAccess(permission.state === "granted" ? "Allowed in this browser" : permission.state === "denied" ? "Blocked in this browser" : "Ask when you use current location");
      update();
      permission.addEventListener("change", update);
    });
    return () => { mounted = false; };
  }, []);

  const saveProfile = async () => {
    if (!name.trim() || !phone.trim()) {
      setMessage("Full name and phone number are required.");
      return;
    }
    if (!/^(?:\+234|0)[789]\d{9}$/.test(phone.replace(/[\s()-]/g, ""))) {
      setMessage("Enter a valid Nigerian phone number.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      await updateProfile({
        name,
        phone,
        ...(!isStudent ? { vehicle, plateNumber, payoutBankName, payoutBankCode, payoutAccountNumber, payoutAccountName } : {}),
      });
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile could not be updated.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!current || !next || !confirmNext) {
      setMessage("Complete all password fields.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(next)) {
      setMessage("New password must be 8+ characters with uppercase, lowercase, and a number.");
      return;
    }
    if (next !== confirmNext) {
      setMessage("New passwords do not match.");
      return;
    }
    setIsChangingPassword(true);
    setMessage("");
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirmNext("");
      setMessage("Password changed securely.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password could not be changed.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <section className="settings-page">
      <div className="settings-heading"><div><span className="eyebrow">A9 account</span><h1>Profile & settings</h1><p>Keep your account details current and your access secure.</p></div><div className="settings-profile-summary"><span className="settings-avatar">{account.name?.slice(0, 2).toUpperCase() ?? "A9"}</span><div><strong>{account.name}</strong><span>{isStudent ? "Customer account" : "Rider account"}</span></div></div></div>
      <div className="settings-layout">
        <div className="settings-main-column">
          <section className="settings-card settings-profile-card">
            <div className="settings-card-heading"><div><span className="eyebrow">Profile</span><h2>Personal information</h2></div><span className="settings-role-badge">{isStudent ? "Customer" : "Rider"}</span></div>
            <div className="settings-form-grid">
              <label><span>Full name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label><span>Email address</span><input value={account.email ?? ""} readOnly /></label>
              <label><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              {!isStudent && <>
                <label><span>Motorcycle / bike</span><input value={vehicle} onChange={(event) => setVehicle(event.target.value)} /></label>
                <label><span>Plate number</span><input value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} /></label>
              </>}
            </div>
            <div className="settings-card-footer"><span className="settings-muted">Role is fixed for account security.</span><button className="primary-button" type="button" onClick={() => void saveProfile()} disabled={isSaving}>{isSaving ? "Saving..." : "Save profile"}</button></div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><div><span className="eyebrow">Security</span><h2>Change password</h2></div><ShieldCheck size={20} className="settings-security-icon" /></div>
            <div className="settings-form-stack"><label><span>Current password</span><input type="password" placeholder="Enter current password" value={current} onChange={(event) => setCurrent(event.target.value)} /></label><label><span>New password</span><input type="password" placeholder="8+ characters, uppercase, lowercase, number" value={next} onChange={(event) => setNext(event.target.value)} /></label><label><span>Confirm new password</span><input type="password" placeholder="Re-enter new password" value={confirmNext} onChange={(event) => setConfirmNext(event.target.value)} /></label></div><div className="settings-card-footer"><span className="settings-muted">Passwords are handled by secure A9 authentication.</span><button className="primary-button" type="button" onClick={() => void handleChangePassword()} disabled={isChangingPassword}>{isChangingPassword ? "Updating..." : "Change password"}</button></div>
          </section>
        </div>
        <aside className="settings-side-column">
          <section className="settings-card settings-account-card"><span className="eyebrow">Account</span><div className="settings-account-row"><span>Role</span><strong>{isStudent ? "Customer" : "Rider"}</strong></div><div className="settings-account-row"><span>Email</span><strong>{account.email}</strong></div><div className="settings-account-row"><span>Access</span><strong>Verified A9 account</strong></div></section>
          {!isStudent && (
            <section className="settings-card">
              <div className="settings-card-heading"><div><span className="eyebrow">Payout account</span><h2>Bank details</h2></div></div>
              <div className="settings-form-stack">
                <label><span>Bank</span><input value={payoutBankName} onChange={(event) => setPayoutBankName(event.target.value)} placeholder="e.g. Access Bank" /></label>
                <label><span>Bank code</span><input value={payoutBankCode} onChange={(event) => setPayoutBankCode(event.target.value)} placeholder="Paystack bank code" /></label>
                <label><span>Account number</span><input value={payoutAccountNumber} onChange={(event) => setPayoutAccountNumber(event.target.value)} placeholder="10-digit account number" /></label>
                <label><span>Account name</span><input value={payoutAccountName} onChange={(event) => setPayoutAccountName(event.target.value)} placeholder="Account holder name" /></label>
              </div>
            </section>
          )}
          <section className="settings-card"><div className="settings-card-heading"><div><span className="eyebrow">Preferences</span><h2>Access & privacy</h2></div></div><div className="settings-preference"><span className="settings-preference-icon"><MapPin size={17} /></span><div><strong>Location access</strong><small>{locationAccess}</small></div></div><p className="settings-muted">Location is requested only when you choose Current Location while booking a ride.</p></section>
          <button className="settings-signout" type="button" onClick={signOut}>Sign out of A9 <ArrowRight size={16} /></button>
        </aside>
      </div>
      {message && <p className={message.includes("successfully") || message.includes("securely") ? "settings-feedback success" : "settings-feedback"} role="status">{message}</p>}
    </section>
  );
}
function AdminDashboard({ account }: { account: any }) {
  const ensureSchoolLocations = useMutation(api.rides.ensureLocations);
  const schoolLocations = useQuery(api.rides.listSchoolLocations) ?? [];
  const riders = (useQuery(api.users.listVerificationSubmissions, {}) ?? []) as Array<{
    _id: Id<"users">;
    name?: string;
    email?: string;
    phone?: string;
    averageRating: number;
    ratingCount: number;
    verificationStatus?: VerificationStatus;
    verificationSubmittedAt?: number;
  }>;
  const adminEarnings = useQuery(api.earnings.getAdminEarningsSummary) ?? [];
  const completionRides = useQuery(api.rides.listAdminCompletionRides) ?? [];
  const financialRecords = useQuery(api.payments.getAdminFinancialRecords) ?? [];
  const paymentPool = useQuery(api.payments.getPaymentPoolSummary);
  const reviewVerification = useMutation(api.users.reviewVerification);
  const updateSchoolLocationCoordinates = useMutation(api.rides.updateSchoolLocationCoordinates);
  const approvePayout = useMutation(api.payments.approvePayoutRequest);
  const rejectPayout = useMutation(api.payments.rejectPayoutRequest);
  const payoutRequests = useQuery(api.payments.getPayoutRequests) ?? [];
  const [filter, setFilter] = useState<"all" | VerificationStatus>("under_review");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const [payoutId, setPayoutId] = useState<Id<"payouts"> | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [message, setMessage] = useState("");
  const [coordinateLocationId, setCoordinateLocationId] = useState<Id<"locations"> | "">("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [coordinateMessage, setCoordinateMessage] = useState("");
  const [savingCoordinates, setSavingCoordinates] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"verification" | "payments">("verification");
  const selected = useQuery(api.users.getVerificationDetails, selectedId ? { riderId: selectedId } : "skip");
  const verificationHistory = useQuery(api.audit.listVerificationEvents, selectedId ? { riderId: selectedId } : "skip") ?? [];
  const selectedPayout = payoutRequests.find((item: any) => item._id === payoutId) ?? null;
  const coordinateLocation = schoolLocations.find((location) => location._id === coordinateLocationId);
  useEffect(() => {
    if (!coordinateLocationId && schoolLocations[0]) setCoordinateLocationId(schoolLocations[0]._id);
  }, [coordinateLocationId, schoolLocations]);
  useEffect(() => {
    setLatitude(coordinateLocation?.latitude === undefined ? "" : String(coordinateLocation.latitude));
    setLongitude(coordinateLocation?.longitude === undefined ? "" : String(coordinateLocation.longitude));
  }, [coordinateLocationId, coordinateLocation?.latitude, coordinateLocation?.longitude]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRiders = riders.filter((rider) => {
    const status = rider.verificationStatus ?? "not_verified";
    const matchesFilter = filter === "all" || status === filter;
    const matchesSearch = !normalizedSearch || [rider.name, rider.email, rider.phone].some((value) => value?.toLowerCase().includes(normalizedSearch));
    return matchesFilter && matchesSearch;
  });
  useEffect(() => {
    void ensureSchoolLocations({});
  }, [ensureSchoolLocations]);
  const counts = {
    pending: riders.filter((rider) => rider.verificationStatus === "under_review").length,
    approved: riders.filter((rider) => rider.verificationStatus === "approved").length,
    rejected: riders.filter((rider) => rider.verificationStatus === "rejected").length,
    total: riders.length,
  };
  const closeReview = () => { setSelectedId(null); setDecision(null); setRejectionReason(""); };
  const submitReview = async () => {
    if (!selectedId || !decision || (decision === "rejected" && !rejectionReason.trim())) return;
    setIsSaving(true);
    try {
      await reviewVerification({ riderId: selectedId, decision, rejectionReason: decision === "rejected" ? rejectionReason.trim() : undefined });
      setMessage(decision === "approved" ? "Rider approved and cleared to accept rides." : "Rider rejected. The reason is now visible to the rider.");
      closeReview();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Review could not be saved.");
    } finally { setIsSaving(false); }
  };
  const saveLocationCoordinates = async () => {
    if (!coordinateLocation || !latitude.trim() || !longitude.trim()) {
      setCoordinateMessage("Enter mapped coordinates for the selected stop.");
      return;
    }
    setSavingCoordinates(true);
    setCoordinateMessage("");
    try {
      await updateSchoolLocationCoordinates({
        locationId: coordinateLocation._id,
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      setCoordinateMessage("Stop coordinates saved.");
    } catch (caught) {
      setCoordinateMessage(caught instanceof Error ? caught.message : "Stop coordinates could not be saved.");
    } finally {
      setSavingCoordinates(false);
    }
  };
  const statusLabel = (status: VerificationStatus) => status === "approved" ? "Verified" : status === "under_review" ? "Under Review" : status === "rejected" ? "Rejected" : "Not Verified";
  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div><span className="eyebrow"><ShieldCheck size={14} /> A9 operations</span><h1>Rider verification</h1><p>Review rider identity submissions and manage access to ride requests.</p></div>
        <span className="admin-profile-chip"><span className="avatar">{account.name?.slice(0, 2).toUpperCase() ?? "A9"}</span>{account.name ?? "Administrator"}</span>
      </header>
      {selectedId && verificationHistory.length > 0 && <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Audit trail</span><h2>Verification history</h2></div></div><div className="admin-earnings-list">{verificationHistory.map((event: any) => <div className="admin-earnings-row" key={`${event.action}-${event.createdAt}`}><div><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.status} · {new Date(event.createdAt).toLocaleString()}</span></div>{event.reason && <div><span>Reason</span><strong>{event.reason}</strong></div>}</div>)}</div></section>}
      <div className="admin-summary-grid">
        <AdminMetric label="Pending verification" value={counts.pending} tone="pending" />
        <AdminMetric label="Approved riders" value={counts.approved} tone="approved" />
        <AdminMetric label="Rejected riders" value={counts.rejected} tone="rejected" />
        <AdminMetric label="Total riders" value={counts.total} tone="total" />
      </div>
      <div className="admin-toolbar" style={{ marginTop: 16 }}>
        {(["verification", "payments"] as const).map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? "admin-filter active" : "admin-filter"} onClick={() => setActiveTab(tab)}>{tab === "verification" ? "Rider Verification" : "Payments & Payouts"}</button>
        ))}
      </div>
      {activeTab === "verification" && <section className="admin-verification-card admin-location-config"><div className="admin-section-heading"><div><span className="eyebrow">Optional map data</span><h2>School stop coordinates</h2><p>Coordinates may support future map features. Ride requests and price negotiations do not require them.</p></div><span className="admin-live-label"><span /> {schoolLocations.filter((location) => location.latitude !== undefined && location.longitude !== undefined).length}/{schoolLocations.length} configured</span></div><div className="admin-location-coordinate-form"><label>School stop<select value={coordinateLocationId} onChange={(event) => setCoordinateLocationId(event.target.value as Id<"locations"> | "")}><option value="">Select a stop</option>{schoolLocations.map((location) => <option key={location._id} value={location._id}>{location.groupLabel} · {location.name}</option>)}</select></label><label>Latitude<input type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="Verified latitude" /></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="Verified longitude" /></label><button className="primary-button" type="button" onClick={() => void saveLocationCoordinates()} disabled={!coordinateLocation || savingCoordinates}>{savingCoordinates ? "Saving..." : "Save coordinates"}</button></div>{coordinateMessage && <p className="admin-location-feedback" role="status">{coordinateMessage}</p>}</section>}
      {activeTab === "verification" && (
        <>
          <section className="admin-verification-card"><div className="admin-section-heading"><div><span className="eyebrow">Rider verification</span><h2>Verification queue</h2></div><span className="admin-live-label"><span /> Live database</span></div><div className="admin-toolbar"><div className="admin-filters">{(["all", "under_review", "approved", "rejected", "not_verified"] as const).map((value) => <button key={value} className={filter === value ? "admin-filter active" : "admin-filter"} type="button" onClick={() => setFilter(value)}>{value === "all" ? "All" : statusLabel(value)}</button>)}</div><input className="admin-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or email" aria-label="Search riders" /></div><div className="admin-rider-list">{visibleRiders.length === 0 ? <div className="admin-empty"><ShieldCheck size={22} /><strong>No riders match this view</strong><span>New submissions will appear here automatically.</span></div> : visibleRiders.map((rider) => { const status = (rider.verificationStatus ?? "not_verified") as VerificationStatus; return <div className="admin-rider-row" key={rider._id}><span className="admin-rider-avatar">{rider.name?.slice(0, 2).toUpperCase() ?? "A9"}</span><div className="admin-rider-identity"><strong>{rider.name ?? "Unnamed rider"}</strong><span>{rider.phone ?? "No phone"} · {rider.email ?? "No email"}</span></div><span className="admin-rider-rating">{rider.ratingCount ? `★ ${rider.averageRating.toFixed(1)} · ${rider.ratingCount}` : "No ratings yet"}</span><span className={`verification-badge verification-badge--${status === "approved" ? "success" : status === "rejected" ? "danger" : status === "under_review" ? "warning" : "neutral"}`}>{statusLabel(status)}</span><span className="admin-submitted-date">{rider.verificationSubmittedAt ? new Date(rider.verificationSubmittedAt).toLocaleDateString() : "—"}</span><button className="secondary-button admin-review-button" type="button" onClick={() => { setSelectedId(rider._id); setMessage(""); }}>Review <ArrowRight size={15} /></button></div>; })}</div></section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ledger visibility</span><h2>Rider earnings</h2></div><span className="admin-live-label"><span /> Live rider balances</span></div>{adminEarnings.length === 0 ? <div className="admin-empty"><strong>No completed ride earnings yet</strong><span>Eligible earnings appear after a paid ride is completed.</span></div> : <div className="admin-earnings-list">{adminEarnings.map((entry: any) => <div className="admin-earnings-row" key={entry.riderId}><div><strong>{entry.riderName ?? "Unnamed rider"}</strong><span>{entry.completedRides} completed ride{entry.completedRides === 1 ? "" : "s"}</span></div><div><span>Total eligible</span><strong>₦{entry.totalEligible.toLocaleString()}</strong></div><div><span>Pending</span><strong>₦{entry.pending.toLocaleString()}</strong></div><div><span>Paid</span><strong>₦{entry.paid.toLocaleString()}</strong></div></div>)}</div>}</section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ride audit</span><h2>Completion review</h2></div><span className="admin-live-label"><span /> Confirmation required</span></div>{completionRides.length === 0 ? <div className="admin-empty"><strong>No completion events yet</strong><span>Awaiting, completed, and disputed rides will appear here.</span></div> : <div className="admin-earnings-list">{completionRides.map((ride: any) => <div className="admin-earnings-row" key={ride._id}><div><strong>{ride.studentName ?? "Customer"} → {ride.riderName ?? "Unassigned"}</strong><span>{ride.destinationLabel ?? "Destination unavailable"}</span></div><div><span>Fare</span><strong>{formatNaira(ride.fare)}</strong></div><div><span>Status</span><strong>{ride.status === "awaiting_confirmation" ? "Awaiting confirmation" : ride.status[0].toUpperCase() + ride.status.slice(1)}</strong></div><div><span>Confirmed by</span><strong>{ride.confirmedByName ?? "—"}</strong></div><div><span>Issue / time</span><strong>{ride.disputeReason ?? (ride.completionConfirmedAt ? new Date(ride.completionConfirmedAt).toLocaleString() : "—")}</strong></div></div>)}</div>}</section>
        </>
      )}
      {activeTab === "payments" && (
        <>
          <section className="admin-verification-card admin-payment-pool"><div className="admin-section-heading"><div><span className="eyebrow">A9 escrow ledger</span><h2>Payment Pool</h2></div><span className="admin-live-label"><span /> Live NGN balance</span></div><div className="admin-summary-grid admin-pool-grid"><AdminMetric label="Total payment pool" value={formatNaira(paymentPool?.total ?? 0)} tone="total" /><AdminMetric label="Held for active rides" value={formatNaira(paymentPool?.held ?? 0)} tone="pending" /><AdminMetric label="Rider earnings" value={formatNaira(paymentPool?.eligible ?? 0)} tone="approved" /><AdminMetric label="Pending payouts" value={formatNaira(paymentPool?.pendingPayout ?? 0)} tone="pending" /><AdminMetric label="Paid to riders" value={formatNaira(paymentPool?.paid ?? 0)} tone="approved" /><AdminMetric label="Refunded" value={formatNaira(paymentPool?.refunded ?? 0)} tone="rejected" /><AdminMetric label="Disputed" value={formatNaira(paymentPool?.disputed ?? 0)} tone="rejected" /></div>{paymentPool?.records.length ? <div className="admin-earnings-list">{paymentPool.records.slice(0, 30).map((record: any) => <div className="admin-earnings-row" key={String(record.paymentId)}><div><strong>Ride {String(record.rideId).slice(-8)}</strong><span>{record.studentName ?? "Customer"} → {record.riderName ?? "Unassigned"}</span></div><div><span>Amount</span><strong>{formatNaira(record.amount)}</strong></div><div><span>Payment</span><strong>{record.paymentStage.replaceAll("_", " ")}</strong></div><div><span>Ride / payout</span><strong>{record.rideStatus} / {record.payoutStatus}</strong></div></div>)}</div> : <div className="admin-empty"><strong>No ride-payment records yet</strong><span>Paid ride funds will appear here as held escrow records.</span></div>}</section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Payments & payouts</span><h2>Payout requests</h2></div><span className="admin-live-label"><span /> Review queue</span></div>{payoutRequests.length === 0 ? <div className="admin-empty"><strong>No payout requests</strong><span>Rider payout submissions will appear here.</span></div> : <div className="admin-earnings-list">{payoutRequests.map((request: any) => <div className="admin-earnings-row" key={request._id}><div><strong>{request.riderName ?? "Rider"}</strong><span>{request.bankName ?? "Bank not set"} · {request.accountNumber ? `****${String(request.accountNumber).slice(-4)}` : "—"}</span></div><div><span>Amount</span><strong>{formatNaira(request.amount)}</strong></div><div><span>Status</span><strong>{request.status}</strong></div><div><button className="secondary-button" type="button" onClick={() => setPayoutId(request._id)}>Review</button></div></div>)}</div>}</section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Payout history</span><h2>Recent payout activity</h2></div><span className="admin-live-label"><span /> Ledger</span></div>{payoutRequests.length === 0 ? <div className="admin-empty"><strong>No payout history</strong><span>Approved, rejected, and paid requests will appear here.</span></div> : <div className="admin-earnings-list">{payoutRequests.slice(0, 12).map((request: any) => <div className="admin-earnings-row" key={`history-${request._id}`}><div><strong>{request.riderName ?? "Rider"}</strong><span>{new Date(request.requestedAt ?? request.createdAt).toLocaleDateString()}</span></div><div><span>Amount</span><strong>{formatNaira(request.amount)}</strong></div><div><span>Status</span><strong>{request.status}</strong></div><div><span>Ref</span><strong>{request.reference.slice(-8)}</strong></div></div>)}</div>}</section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Money ledger</span><h2>Financial activity</h2></div><span className="admin-live-label"><span /> NGN records</span></div>{financialRecords.length === 0 ? <div className="admin-empty"><strong>No financial records yet</strong><span>Funding, ride payments, withdrawals, and earnings will appear here.</span></div> : <div className="admin-earnings-list">{financialRecords.slice(0, 30).map((record: any) => <div className="admin-earnings-row" key={`${record.kind}-${record.reference}`}><div><strong>{record.kind.replace("_", " ")}</strong><span>{record.userName ?? "Account unavailable"} · {new Date(record.createdAt).toLocaleDateString()}</span></div><div><span>Amount</span><strong>{formatNaira(record.amount)}</strong></div><div><span>Reference</span><strong>{record.reference.slice(-18)}</strong></div><div><span>Status</span><strong>{record.status[0].toUpperCase() + record.status.slice(1)}</strong></div></div>)}</div>}</section>
        </>
      )}
      <section className="admin-verification-card">
        <div className="admin-section-heading"><div><span className="eyebrow">Rider verification</span><h2>Verification queue</h2></div><span className="admin-live-label"><span /> Live database</span></div>
        <div className="admin-toolbar"><div className="admin-filters">{(["all", "under_review", "approved", "rejected", "not_verified"] as const).map((value) => <button key={value} className={filter === value ? "admin-filter active" : "admin-filter"} type="button" onClick={() => setFilter(value)}>{value === "all" ? "All" : statusLabel(value)}</button>)}</div><input className="admin-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or email" aria-label="Search riders" /></div>
        <div className="admin-rider-list">
          {visibleRiders.length === 0 ? <div className="admin-empty"><ShieldCheck size={22} /><strong>No riders match this view</strong><span>New submissions will appear here automatically.</span></div> : visibleRiders.map((rider) => {
            const status = (rider.verificationStatus ?? "not_verified") as VerificationStatus;
            return <div className="admin-rider-row" key={rider._id}><span className="admin-rider-avatar">{rider.name?.slice(0, 2).toUpperCase() ?? "A9"}</span><div className="admin-rider-identity"><strong>{rider.name ?? "Unnamed rider"}</strong><span>{rider.phone ?? "No phone"} · {rider.email ?? "No email"}</span></div><span className={`verification-badge verification-badge--${status === "approved" ? "success" : status === "rejected" ? "danger" : status === "under_review" ? "warning" : "neutral"}`}>{statusLabel(status)}</span><span className="admin-submitted-date">{rider.verificationSubmittedAt ? new Date(rider.verificationSubmittedAt).toLocaleDateString() : "—"}</span><button className="secondary-button admin-review-button" type="button" onClick={() => { setSelectedId(rider._id); setMessage(""); }}>Review <ArrowRight size={15} /></button></div>;
          })}
        </div>
      </section>
      <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ledger visibility</span><h2>Rider earnings</h2></div><span className="admin-live-label"><span /> Live rider balances</span></div>{adminEarnings.length === 0 ? <div className="admin-empty"><strong>No completed ride earnings yet</strong><span>Eligible earnings appear after a paid ride is completed.</span></div> : <div className="admin-earnings-list">{adminEarnings.map((entry: any) => <div className="admin-earnings-row" key={entry.riderId}><div><strong>{entry.riderName ?? "Unnamed rider"}</strong><span>{entry.completedRides} completed ride{entry.completedRides === 1 ? "" : "s"}</span></div><div><span>Total eligible</span><strong>₦{entry.totalEligible.toLocaleString()}</strong></div><div><span>Pending</span><strong>₦{entry.pending.toLocaleString()}</strong></div><div><span>Paid</span><strong>₦{entry.paid.toLocaleString()}</strong></div></div>)}</div>}</section>
      <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Payments & payouts</span><h2>Payout requests</h2></div><span className="admin-live-label"><span /> Review queue</span></div>{payoutRequests.length === 0 ? <div className="admin-empty"><strong>No payout requests</strong><span>Rider payout submissions will appear here.</span></div> : <div className="admin-earnings-list">{payoutRequests.map((request: any) => <div className="admin-earnings-row" key={request._id}><div><strong>{request.riderName ?? "Rider"}</strong><span>{request.bankName ?? "Bank not set"} · {request.accountNumber ? `****${String(request.accountNumber).slice(-4)}` : "—"}</span></div><div><span>Amount</span><strong>{formatNaira(request.amount)}</strong></div><div><span>Status</span><strong>{request.status}</strong></div><div><button className="secondary-button" type="button" onClick={() => setPayoutId(request._id)}>Review</button></div></div>)}</div>}</section>
      <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ride audit</span><h2>Completion review</h2></div><span className="admin-live-label"><span /> Confirmation required</span></div>{completionRides.length === 0 ? <div className="admin-empty"><strong>No completion events yet</strong><span>Awaiting, completed, and disputed rides will appear here.</span></div> : <div className="admin-earnings-list">{completionRides.map((ride: any) => <div className="admin-earnings-row" key={ride._id}><div><strong>{ride.studentName ?? "Customer"} → {ride.riderName ?? "Unassigned"}</strong><span>{ride.destinationLabel ?? "Destination unavailable"}</span></div><div><span>Status</span><strong>{ride.status === "awaiting_confirmation" ? "Awaiting confirmation" : ride.status[0].toUpperCase() + ride.status.slice(1)}</strong></div><div><span>Confirmed by</span><strong>{ride.confirmedByName ?? "—"}</strong></div><div><span>Issue / time</span><strong>{ride.disputeReason ?? (ride.completionConfirmedAt ? new Date(ride.completionConfirmedAt).toLocaleString() : "—")}</strong></div></div>)}</div>}</section>
      <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Money ledger</span><h2>Financial activity</h2></div><span className="admin-live-label"><span /> NGN records</span></div>{financialRecords.length === 0 ? <div className="admin-empty"><strong>No financial records yet</strong><span>Funding, ride payments, withdrawals, and earnings will appear here.</span></div> : <div className="admin-earnings-list">{financialRecords.slice(0, 30).map((record: any) => <div className="admin-earnings-row" key={`${record.kind}-${record.reference}`}><div><strong>{record.kind.replace("_", " ")}</strong><span>{record.userName ?? "Account unavailable"} · {new Date(record.createdAt).toLocaleDateString()}</span></div><div><span>Amount</span><strong>{formatNaira(record.amount)}</strong></div><div><span>Reference</span><strong>{record.reference.slice(-18)}</strong></div><div><span>Status</span><strong>{record.status[0].toUpperCase() + record.status.slice(1)}</strong></div></div>)}</div>}</section>
      {message && <p className="settings-feedback" role="status">{message}</p>}
      {selectedId && selected && <div className="admin-review-overlay" role="dialog" aria-modal="true"><section className="admin-review-panel"><div className="admin-review-heading"><div><span className="eyebrow">Secure review</span><h2>{selected.name ?? "Rider verification"}</h2><p>{selected.email ?? selected.phone ?? "No contact details"}</p></div><button className="icon-close-button" type="button" onClick={closeReview} aria-label="Close review"><X size={20} /></button></div><div className="admin-detail-grid"><div><h3>Rider information</h3><AdminDetail label="Phone" value={selected.phone} /><AdminDetail label="Average rating" value={selected.ratingCount ? `${selected.averageRating.toFixed(1)} / 5` : "No ratings yet"} /><AdminDetail label="Ratings received" value={String(selected.ratingCount)} /><AdminDetail label="Date of birth" value={selected.verificationDateOfBirth} /><AdminDetail label="Address" value={selected.verificationAddress} /><AdminDetail label="Emergency contact" value={[selected.verificationEmergencyName, selected.verificationEmergencyPhone].filter(Boolean).join(" · ")} /></div><div><h3>Identity verification</h3><AdminDetail label="ID type" value={selected.verificationIdType?.replace("_", " ")} /><AdminDetail label="ID number" value={selected.verificationIdNumber} /><div className="admin-document-grid">{selected.idDocumentUrl && (selected.idDocumentContentType === "application/pdf" ? <a className="admin-pdf-preview" href={selected.idDocumentUrl} target="_blank" rel="noreferrer"><FileText size={24} /><span>Open government ID PDF</span></a> : <a href={selected.idDocumentUrl} target="_blank" rel="noreferrer"><img src={selected.idDocumentUrl} alt="Government ID document" /></a>)}{selected.selfieUrl && <a href={selected.selfieUrl} target="_blank" rel="noreferrer"><img src={selected.selfieUrl} alt="Rider selfie" /></a>}</div></div></div>{selected.verificationRejectionReason && <div className="admin-rejection-note"><strong>Previous rejection reason</strong><span>{selected.verificationRejectionReason}</span></div>}<div className="admin-review-actions">{selected.verificationStatus !== "approved" && <button className="primary-button" type="button" onClick={() => setDecision("approved")}>Approve Verification <Check size={16} /></button>}{selected.verificationStatus !== "rejected" && <button className="admin-danger-button" type="button" onClick={() => setDecision("rejected")}>Reject Verification <X size={16} /></button>}</div></section></div>}
      {decision && <div className="admin-confirm-overlay" role="dialog" aria-modal="true"><section className="admin-confirm-card"><span className="eyebrow">{decision === "approved" ? "Confirm approval" : "Required before rejection"}</span><h2>{decision === "approved" ? "Approve Rider Verification?" : "Reason for rejection"}</h2><p>{decision === "approved" ? "This rider will be allowed to accept A9 ride requests." : "Tell the rider what needs to be corrected before they resubmit."}</p>{decision === "rejected" && <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Enter reason..." rows={4} autoFocus /> }<div className="admin-confirm-actions"><button className="secondary-button" type="button" onClick={() => setDecision(null)}>Cancel</button><button className={decision === "approved" ? "primary-button" : "admin-danger-button"} type="button" onClick={() => void submitReview()} disabled={isSaving || (decision === "rejected" && !rejectionReason.trim())}>{isSaving ? "Saving..." : decision === "approved" ? "Approve" : "Reject Verification"}</button></div></section></div>}
    </section>
  );
}

function AdminMetric({ label, value, tone }: { label: string; value: number | string; tone: string }) { return <div className={`admin-metric admin-metric--${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function AdminDetail({ label, value }: { label: string; value?: string }) { return <div className="admin-detail"><span>{label}</span><strong>{value || "Not provided"}</strong></div>; }
function Help() {
  const [openIndex, setOpenIndex] = useState(-1);
  const faqItems = [
    {
      question: "How do I book a ride?",
      answer: "Select your pickup location and destination, then tap Confirm Ride. Your request will appear as \"Waiting for Rider\" until a rider accepts it.",
    },
    {
      question: "Am I charged when I request a ride?",
      answer: "No. Your wallet is not charged while your ride request is waiting. Payment is processed only after a rider accepts your ride.",
    },
    {
      question: "Can I request more than one ride?",
      answer: "Yes. You can have up to 5 pending ride requests while waiting for a rider.",
    },
    {
      question: "What happens when one rider accepts my ride?",
      answer: "The rider who accepts becomes your assigned rider. Your other pending ride requests are automatically cancelled, and the fare for the accepted ride is then secured in A9.",
    },
    {
      question: "What happens to my other ride requests?",
      answer: "Once one rider accepts, all your other pending requests are automatically cancelled. You are not charged for those cancelled requests.",
    },
    {
      question: "When does A9 hold my payment?",
      answer: "A9 secures the fare only after a rider accepts your ride. Before acceptance, no money is deducted from your wallet.",
    },
    {
      question: "What happens if no rider accepts?",
      answer: "A pending ride request automatically expires/cancels after 10 minutes if no rider accepts it. You are not charged.",
    },
    {
      question: "Can I cancel a waiting ride?",
      answer: "Use the existing A9 cancellation option if available. A waiting ride that has not been accepted does not create a held payment.",
    },
    {
      question: "When is the rider paid?",
      answer: "The rider does not receive the money immediately after accepting. The fare remains secured by A9 until the ride is completed and the customer confirms completion. It then becomes part of the rider's earnings.",
    },
    {
      question: "What if I have a problem during a ride?",
      answer: "Use the available Safety & Help options in the A9 portal for guidance and support.",
    },
  ];

  return (
    <section className="help-page">
      <span className="eyebrow">Help center</span>
      <h2>Move with confidence.</h2>
      <p>
        A9 uses consistent service locations so customers and riders share clear
        pickup and destination details.
      </p>
      <div className="help-faq">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.question} className={`help-faq-item ${isOpen ? "open" : ""}`}>
              <button type="button" className="help-faq-trigger" onClick={() => setOpenIndex(isOpen ? -1 : index)}>
                <span>{item.question}</span>
                <ChevronDown size={16} className={isOpen ? "rotated" : ""} />
              </button>
              {isOpen && <p className="help-faq-answer">{item.answer}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
function Loading({ text }: { text: string }) {
  return (
    <div className="app-shell">
      <div className="loading-screen">
        <BrandMark tone="light" size={48} />
        <p>{text}</p>
      </div>
    </div>
  );
}
