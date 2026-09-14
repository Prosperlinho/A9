
import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
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
  Eye,
  EyeOff,
  FileText,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
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
  | "accepted"
  | "rider_arriving"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled"
  | "disputed";
type Page = "dashboard" | "booking" | "wallet" | "settings" | "help" | "verification";
type VerificationStatus = "not_verified" | "under_review" | "approved" | "rejected";
type Location = {
  _id: Id<"locations">;
  slug?: string;
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
  state: string;
};
type Ride = {
  _id: Id<"rides">;
  pickupLabel: string;
  destinationLabel: string;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  fare: number;
  status: Status;
  requestedAt: number;
  acceptedAt?: number;
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
  accepted: "Rider accepted",
  rider_arriving: "Rider is arriving",
  in_progress: "Ride in progress",
  awaiting_confirmation: "Awaiting your confirmation",
  completed: "Ride completed",
  cancelled: "Ride cancelled",
  disputed: "Ride issue reported",
};

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const account = useQuery(api.users.current);
  const [authMode, setAuthMode] = useState<AuthView>(null);
  const [error, setError] = useState("");
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
  if (!account) return <Loading text="Loading your account..." />;
  return (
    <AuthenticatedApp
      account={account}
      signOut={signOut}
    />
  );
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
          <span>AE-FUNAI</span>
          <span className="landing-nav-dot" />
          <span>Ebonyi, Nigeria</span>
        </div>
        <button className="landing-signin" onClick={() => setMode("signIn")}>
          Sign in
        </button>
      </header>
      <main className="landing-main">
        <section className="landing-copy">
          <div className="landing-kicker"><span className="landing-kicker-line" /> CAMPUS MOBILITY / AE-FUNAI</div>
          <h1>A smarter way to move around <em>AE-FUNAI.</em></h1>
          <p className="landing-lede">A9 connects students with trusted campus riders for quick, reliable trips between the places that matter.</p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => openJoin()}>Get started <ArrowRight size={18} /></button>
            <button className="landing-secondary" onClick={() => openJoin("rider")}>Become a rider <Bike size={17} /></button>
          </div>
          <div className="landing-trust"><ShieldCheck size={17} /><span>Built for the AE-FUNAI community</span><span className="landing-trust-rule" /><span>Ebonyi State service area</span></div>
        </section>
        <section className="landing-scene" aria-label="A9 campus mobility preview">
          <div className="landing-grid" />
          <div className="landing-glow landing-glow-one" /><div className="landing-glow landing-glow-two" />
          <div className="landing-route route-a"><span /><span /><span /></div>
          <div className="landing-route route-b"><span /><span /><span /></div>
          <div className="landing-campus-card"><span className="landing-card-label">LIVE CAMPUS NETWORK</span><strong>Move with confidence.</strong><span>One connected ride community.</span><div className="landing-card-stats"><span><b>01</b> pickup</span><span><b>02</b> drop-off</span><span><b>24/7</b> local</span></div></div>
          <div className="landing-map-pin pin-campus"><MapPin size={16} /><span>AE-FUNAI campus</span></div>
          <div className="landing-map-pin pin-city"><MapPin size={16} /><span>Abakaliki</span></div>
          <div className="landing-bike"><Bike size={112} strokeWidth={1.05} /><div className="landing-bike-ring" /></div>
          <div className="landing-coordinate">06°19'30"N<br />08°06'49"E</div>
        </section>
      </main>
      <div className="landing-bottom"><span>STUDENT RIDES</span><span>TRUSTED RIDERS</span><span>LIVE STATUS</span><span>LOCAL KNOWLEDGE</span></div>
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
        Pick one role. A9 accounts are either student or rider — never both.
      </p>
      <div className="role-cards" role="radiogroup" aria-label="Choose how you’ll use A9">
        <button
          type="button"
          role="radio"
          aria-checked={selected === "student"}
          className={selected === "student" ? "role-card selected" : "role-card"}
          onClick={() => onSelect("student")}
        >
          <span className="role-card-kicker">STUDENT</span>
          <strong>Register as a Student</strong>
          <span>
            Students use A9 to find and book rides around AE-FUNAI.
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
            Riders provide transportation services to students through A9.
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
    matricNumber: "",
    faculty: "",
    department: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setError("Complete every field to create your student account.");
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
        matricNumber: form.matricNumber.trim().toUpperCase(),
        faculty: form.faculty.trim(),
        department: form.department.trim(),
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
  ) => (
    <label className="registration-field">
      <span>{label}</span>
      <input
        required
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => update(key, event.target.value)}
      />
    </label>
  );

  return (
    <form className="auth-form register-form register-form--student" onSubmit={submit}>
      <button className="text-button" type="button" onClick={onBack}>
        Change role
      </button>
      <div className="auth-form-brand">
        <BrandMark tone="dark" />
      </div>
      <span className="eyebrow">Student registration</span>
      <h2>Create your student account</h2>
      <p className="join-lede">
        Join the AE-FUNAI campus mobility network with your verified student details.
      </p>
      <div className="registration-fields">
        {field("name", "Full name", "e.g. Ada Okafor")}
        {field("email", "Email address", "you@example.com", "email")}
        {field("phone", "Phone number", "08012345678", "tel")}
        {field("matricNumber", "Student matriculation number", "e.g. AE-FUNAI/CSC/2024/001")}
        {field("faculty", "Faculty / school", "e.g. Faculty of Computing")}
        {field("department", "Department", "e.g. Computer Science")}
        {field("password", "Password", "8+ characters, uppercase, lowercase, number", "password")}
        {field("confirmPassword", "Confirm password", "Re-enter your password", "password")}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating student account..." : "Create student account"} <ArrowRight size={18} />
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
  ) => (
    <label className="registration-field">
      <span>{label}</span>
      <input
        required
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => update(key, event.target.value)}
      />
    </label>
  );

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
        Share safe, reliable motorcycle trips with students around AE-FUNAI. Your
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
  const requestWithdrawal = useMutation(api.users.requestWithdrawal);
  const requestPayout = useMutation(api.payments.requestPayout);
  const approvePayout = useMutation(api.payments.approvePayoutRequest);
  const rejectPayout = useMutation(api.payments.rejectPayoutRequest);
  const markPayoutAsPaid = useMutation(api.payments.markPayoutPaid);
  const changePassword = useAction((api as any).account.changePassword);
  const role = account.role as Role;
  const verificationStatus = (account.verificationStatus ?? "not_verified") as VerificationStatus;
  const verificationPromptKey = `a9-verification-prompt:${account._id}`;
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(
    () => role === "rider" && verificationStatus === "not_verified" && localStorage.getItem(verificationPromptKey) !== "seen",
  );
  const [verificationGateOpen, setVerificationGateOpen] = useState(false);
  const [rideActionError, setRideActionError] = useState("");
  const rides = useQuery(api.rides.listMyRides) ?? [];
  const openRides = useQuery(api.rides.listOpenRides) ?? [];
  const allRiders = useQuery(api.users.listRiders) ?? [];
  const riderRides =
    role === "rider" ? (useQuery(api.rides.listRiderRides) ?? []) : [];
  const handleCreateRide = async (args: any) => {
    const rideId = await createRide(args);
    setPage("dashboard");
    return rideId;
  };
  const riderEarnings = role === "rider" ? useQuery(api.earnings.getMyEarnings) : null;
  const riderPayouts = role === "rider" ? (useQuery(api.payments.getRiderPayouts) ?? []) : [];
  const wallet = useQuery(api.users.getWallet);
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
    try {
      await acceptRide({ rideId });
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes("Account Verification Required")) {
        setVerificationGateOpen(true);
        return;
      }
      throw caught;
    }
  };
  const handleRideStatus = async (rideId: Id<"rides">, status: Status) => {
    setRideActionError("");
    try {
      await updateStatus({ rideId, status });
    } catch (caught) {
      setRideActionError(caught instanceof Error ? caught.message : "Ride status could not be updated.");
    }
  };
  const handleWalletFunding = async (amount: number): Promise<WalletFundingResult> => {
    const result = await initializeWalletFunding({ amount });
    if (result.authorizationUrl) window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    return result;
  };
  const handleVerifyWalletFunding = (fundingId: Id<"walletFundingRequests">) => verifyWalletFunding({ fundingId });
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("dashboard")}>
          <BrandMark tone="light" wordmark="campus mobility" />
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
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <button className="profile-button" onClick={() => setPage("settings")}>
          <span className="avatar">
            {account.name?.slice(0, 2).toUpperCase() ?? "A9"}
          </span>
          <span>{account.name}</span>
        </button>
      </header>
      <main id="top">
        {rideActionError && <div className="ride-action-error" role="alert">{rideActionError}</div>}
        {page === "settings" ? (
          <Settings
            account={account}
            updateProfile={updateProfile}
            changePassword={changePassword}
            signOut={() => void signOut()}
          />
        ) : page === "help" ? (
          <Help />
        ) : page === "verification" && role === "rider" ? (
          <VerificationPage
            account={account}
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
              account={account}
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
              onAccept={(id) => void handleAccept(id)}
              onDecline={(id) => void declineRide({ rideId: id })}
              onToggleAvailability={(isOnline) => void setRiderAvailability({ isOnline })}
              onStatus={(id, status) => void handleRideStatus(id, status)}
              onConfirmCompletion={(id) => void confirmRideCompletion({ rideId: id })}
              onReportIssue={(id, reason) => void reportRideIssue({ rideId: id, reason })}
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
              account={account}
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
              onAccept={(id) => void handleAccept(id)}
              onDecline={(id) => void declineRide({ rideId: id })}
              onToggleAvailability={(isOnline) => void setRiderAvailability({ isOnline })}
              onStatus={(id, status) => void handleRideStatus(id, status)}
              onConfirmCompletion={(id) => void confirmRideCompletion({ rideId: id })}
              onReportIssue={(id, reason) => void reportRideIssue({ rideId: id, reason })}
              onRequestPayout={(amount) => requestPayout({ amount })}
              onApprovePayout={(payoutId) => approvePayout({ payoutId })}
              onRejectPayout={(payoutId, reason) => rejectPayout({ payoutId, reason })}
              onMarkPayoutPaid={(payoutId, method, notes) => markPayoutAsPaid({ payoutId, method, notes })}
              onNavigate={setPage}
            />
          )
        ) : (
          <Dashboard
            role={role}
            account={account}
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
            onAccept={(id) => void handleAccept(id)}
            onDecline={(id) => void declineRide({ rideId: id })}
            onToggleAvailability={(isOnline) => void setRiderAvailability({ isOnline })}
            onStatus={(id, status) => void handleRideStatus(id, status)}
            onConfirmCompletion={(id) => void confirmRideCompletion({ rideId: id })}
            onReportIssue={(id, reason) => void reportRideIssue({ rideId: id, reason })}
            onRequestPayout={(amount) => requestPayout({ amount })}
            onApprovePayout={(payoutId) => approvePayout({ payoutId })}
            onRejectPayout={(payoutId, reason) => rejectPayout({ payoutId, reason })}
            onMarkPayoutPaid={(payoutId, method, notes) => markPayoutAsPaid({ payoutId, method, notes })}
            onNavigate={setPage}
          />
        )}
      </main>
      <footer>
        <BrandMark tone="light" size={24} />
        <span>A9 / campus mobility</span>
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

function Dashboard({
  role,
  account,
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
  onReportIssue,
  onRequestPayout,
  onApprovePayout,
  onRejectPayout,
  onMarkPayoutPaid,
  onNavigate,
}: {
  role: Role;
  account: any;
  rides: Ride[];
  requestRides: Ride[];
  riderRides: Ride[];
  riders?: Array<{ _id: Id<"users">; name?: string; role: Role; isOnline?: boolean; vehicle?: string; walletBalance: number; }>;
  earnings: any;
  payoutHistory?: Array<any>;
  ride: Ride | null;
  riderRide: Ride | null;
  wallet: any;
  onBook: (args: any) => void;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
  onWithdraw: (args: { amount: number; bankName: string; accountNumber: string; accountName: string }) => Promise<Id<"withdrawals">>;
  onAccept: (id: Id<"rides">) => void;
  onDecline: (id: Id<"rides">) => void;
  onToggleAvailability: (isOnline: boolean) => void;
  onStatus: (id: Id<"rides">, status: Status) => void;
  onConfirmCompletion: (id: Id<"rides">) => void;
  onReportIssue: (id: Id<"rides">, reason: string) => void;
  onRequestPayout?: (amount: number) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }>;
  onApprovePayout?: (payoutId: Id<"payouts">) => Promise<unknown>;
  onRejectPayout?: (payoutId: Id<"payouts">, reason: string) => Promise<unknown>;
  onMarkPayoutPaid?: (payoutId: Id<"payouts">, method: string, notes: string) => Promise<unknown>;
  onNavigate: (page: Page) => void;
}) {
  const safeRequestPayout: (amount: number) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }> =
    onRequestPayout ?? (async () => {
      throw new Error("Payout action is not available for this account.");
    });
  if (role === "student") {
    return (
      <StudentDashboard
        account={account}
        rides={rides}
        riders={riders ?? []}
        wallet={wallet}
        onOpenBooking={() => onNavigate("booking")}
        onFund={onFund}
        onWithdraw={onWithdraw}
        onOpenSettings={() => onNavigate("settings")}
        onConfirmCompletion={onConfirmCompletion}
        onReportIssue={onReportIssue}
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
            <MapPin size={17} /> AE-FUNAI / Ebonyi
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
  riders,
  wallet,
  onFund,
  onOpenBooking,
  onWithdraw,
  onOpenSettings,
  onConfirmCompletion,
  onReportIssue,
  onVerifyFunding,
}: {
  account: any;
  rides: Ride[];
  riders: Array<{ _id: Id<"users">; name?: string; role: Role; isOnline?: boolean; vehicle?: string; walletBalance: number; }>;
  wallet: any;
  onFund: (amount: number) => Promise<WalletFundingResult>;
  onOpenBooking: () => void;
  onWithdraw: (args: { amount: number; bankName: string; accountNumber: string; accountName: string }) => Promise<Id<"withdrawals">>;
  onOpenSettings: () => void;
  onConfirmCompletion: (id: Id<"rides">) => void;
  onReportIssue: (id: Id<"rides">, reason: string) => void;
  onVerifyFunding: (fundingId: Id<"walletFundingRequests">) => Promise<{ status: string }>;
}) {
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [cancelRideId, setCancelRideId] = useState<Id<"rides"> | null>(null);
  const activeRide = rides.find(
    (item) => !["completed", "cancelled", "disputed"].includes(item.status),
  );
  const recentRides = rides.slice(0, 4);
  const firstName = account.name?.trim().split(/\s+/)[0] ?? "there";
  const riderLookup = new Map(riders.map((rider) => [String(rider._id), rider.name ?? "A9 rider"]));
  const selectedRiderName = selectedRide?.riderId ? riderLookup.get(String(selectedRide.riderId)) ?? "Awaiting rider" : "Awaiting rider";
  return (
    <div className="student-dashboard">
      <header className="student-dashboard-header">
        <div>
          <span className="eyebrow">Student dashboard / AE-FUNAI</span>
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

      <div className="student-dashboard-columns">
        <section className="student-dashboard-section">
          <div className="student-section-heading">
            <div><span className="eyebrow">Trip status</span><h2>Active ride</h2></div>
          </div>
          {activeRide ? <ActiveRideCard ride={activeRide} onCancel={setCancelRideId} /> : <EmptyRideState title="No active ride" message="Your next trip will appear here once you request a ride." action="Book a Ride" onClick={onOpenBooking} />}
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
          onClose={() => setCancelRideId(null)}
          onConfirm={() => {
            setCancelRideId(null);
          }}
        />
      )}
    </div>
  );
}

function StudentCompletionCard({ ride, onConfirm, onReport }: { ride: Ride; onConfirm: (id: Id<"rides">) => void; onReport: (id: Id<"rides">, reason: string) => void }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  return <section className="student-completion-card"><span className="eyebrow"><CheckCircle2 size={14} /> Destination reached</span><h2>Confirm Ride Completion</h2><p>Have you arrived at your destination?</p><div className="student-completion-details"><span>Destination<strong>{ride.destinationLabel}</strong></span><span>Ride reference<strong>{String(ride._id).slice(-9)}</strong></span><span>Rider<strong>Assigned A9 rider</strong></span></div>{reporting ? <div className="student-issue-form"><label htmlFor="ride-issue">Report an issue</label><textarea id="ride-issue" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell A9 what happened" /><div><button className="secondary-button" type="button" onClick={() => setReporting(false)}>Cancel</button><button className="admin-danger-button" type="button" onClick={() => onReport(ride._id, reason)} disabled={!reason.trim()}>Report Issue</button></div></div> : <div className="student-completion-actions"><button className="primary-button" type="button" onClick={() => onConfirm(ride._id)}>Confirm Ride <Check size={16} /></button><button className="secondary-button" type="button" onClick={() => setReporting(true)}>Report an Issue</button></div>}</section>;
}

function ActiveRideCard({ ride, onCancel }: { ride: Ride; onCancel: (rideId: Id<"rides">) => void }) {
  const isPendingRequest = ride.status === "requested";
  const cancellationAllowed = ["requested", "accepted", "rider_arriving", "in_progress"].includes(ride.status) && !["awaiting_confirmation", "completed", "cancelled", "disputed"].includes(ride.status);
  return (
    <div className="active-ride-card">
      <div className="active-ride-top"><span className="ride-status-pill"><span />{statusLabels[ride.status]}</span><strong>{formatNaira(ride.fare)}</strong></div>
      <div className="ride-route-line"><div><span>Pickup</span><strong>{ride.pickupLabel}</strong></div><ArrowRight size={18} /><div><span>Destination</span><strong>{ride.destinationLabel}</strong></div></div>
      <div className="active-ride-meta">
        <span>{isPendingRequest ? "Payment will be processed when a rider accepts." : ride.paymentStatus === "paid" ? "Payment confirmed · Money secured by A9" : "Payment status pending"}</span>
        <strong>{isPendingRequest ? "Waiting for Rider" : ride.paymentStatus === "paid" ? "Confirmed" : "Awaiting payment"}</strong>
      </div>
      {cancellationAllowed && (
        <div className="active-ride-actions">
          <button className="secondary-button" type="button" onClick={() => onCancel(ride._id)}>Cancel Ride</button>
        </div>
      )}
    </div>
  );
}

function RecentRideRow({ ride, onOpen }: { ride: Ride; onOpen: () => void }) {
  return <button type="button" className="recent-ride-row" onClick={onOpen}><span className={ride.status === "cancelled" ? "recent-ride-icon cancelled" : "recent-ride-icon"}><MapPin size={16} /></span><div><strong>{ride.pickupLabel} <span>to</span> {ride.destinationLabel}</strong><small>{ride.paymentStatus === "paid" ? "Paid" : (ride.status === "requested" ? "Waiting for Rider" : "Payment pending")} · {statusLabels[ride.status]} · {formatNigerianDate(ride.requestedAt)}</small></div><strong className="recent-ride-fare">{formatNaira(ride.fare)}</strong></button>;
}

function EmptyRideState({ title, message, action, onClick }: { title: string; message: string; action: string; onClick: () => void }) {
  return <div className="empty-ride-state"><span className="empty-ride-icon"><Bike size={22} /></span><div><h3>{title}</h3><p>{message}</p></div><button className="secondary-button" type="button" onClick={onClick}>{action}</button></div>;
}

function RideDetailsModal({ ride, riderName, onClose }: { ride: Ride; riderName: string; onClose: () => void }) {
  const paymentText = ride.paymentStatus === "paid" ? "Paid" : ride.status === "requested" ? "Not charged yet" : "Pending";
  const statusText = ride.status === "requested" ? "Waiting for Rider" : statusLabels[ride.status];
  return (
    <div className="ride-details-overlay" role="dialog" aria-modal="true">
      <div className="ride-details-modal">
        <div className="ride-details-header">
          <div>
            <span className="eyebrow">Ride details</span>
            <h3>{ride.pickupLabel} → {ride.destinationLabel}</h3>
          </div>
          <button className="icon-close-button" type="button" onClick={onClose} aria-label="Close ride details"><X size={18} /></button>
        </div>

        <div className="ride-details-grid">
          <div className="ride-detail-card">
            <span className="eyebrow">Ride</span>
            <div className="ride-detail-row"><span>Pickup</span><strong>{ride.pickupLabel}</strong></div>
            <div className="ride-detail-row"><span>Destination</span><strong>{ride.destinationLabel}</strong></div>
            <div className="ride-detail-row"><span>Fare</span><strong>{formatNaira(ride.fare)}</strong></div>
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
            <div className="ride-detail-row"><span>Fare</span><strong>{formatNaira(ride.fare)}</strong></div>
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

function RideCancelModal({ rideId, onClose, onConfirm }: { rideId: Id<"rides">; onClose: () => void; onConfirm: () => void }) {
  const cancelRide = useMutation(api.rides.updateStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await cancelRide({ rideId, status: "cancelled" });
      onConfirm();
      onClose();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Ride could not be cancelled.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ride-details-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal compact">
        <span className="eyebrow">Cancel ride</span>
        <h3>Cancel this ride?</h3>
        <p>Your held ride payment will be returned to your wallet.</p>
        {message && <p className="payment-error" role="alert">{message}</p>}
        <div className="confirm-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Keep Ride</button>
          <button className="admin-danger-button" type="button" onClick={() => void submit()} disabled={busy}>{busy ? "Cancelling..." : "Cancel Ride"}</button>
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
              <span><strong>{transaction.description}</strong><small>{new Date(transaction.createdAt).toLocaleDateString()}</small></span>
              <strong className={transaction.amount < 0 ? "transaction-amount debit" : "transaction-amount"}>{transaction.amount < 0 ? "-" : "+"}{formatNaira(Math.abs(transaction.amount))}</strong>
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
  }>;
  return (
    <section className="student-wallet-page">
      <button className="text-button wallet-back" type="button" onClick={onBack}>Back to dashboard</button>
      <div className="wallet-page-heading"><span className="eyebrow"><WalletCards size={14} /> A9 wallet</span><h2>Your wallet</h2><p>Manage your available balance and review your real wallet activity.</p></div>
      <div className="wallet-page-balance"><span className="eyebrow">Available balance</span><strong>{formatNaira(wallet?.balance ?? 0)}</strong><div className="student-wallet-funding-row"><input type="number" min="1" placeholder="Amount to add" value={amount} onChange={(event) => setAmount(event.target.value)} /><button className="wallet-action-primary" type="button" disabled={fundingState === "loading"} onClick={() => { setFundingState("loading"); setFundingMessage(""); void onFund(Number(amount)).then((result) => { setFundingId(result.fundingId); setFundingMessage("Checkout opened. Complete payment, then return to verify."); setAmount(""); }).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Unable to initialize payment. Please try again.")).finally(() => setFundingState("idle")); }}>{fundingState === "loading" ? "Initializing payment..." : "Add Money"}</button></div>{fundingMessage && <small className={fundingMessage.includes("opened") ? "payment-success" : "payment-error"}>{fundingMessage}</small>}{fundingId && <button className="secondary-button" type="button" onClick={() => void onVerifyFunding(fundingId).then(() => setFundingMessage("Wallet funding verified. Refreshing balance...")).catch((error) => setFundingMessage(error instanceof Error ? error.message : "Payment is not verified yet."))}>Verify completed payment</button>}</div>
      <div className="wallet-page-transactions"><div className="student-wallet-activity-heading"><h3>All transactions</h3></div>{transactions.length === 0 ? <p className="student-wallet-empty">No wallet transactions yet.</p> : transactions.map((transaction) => <div className="student-wallet-transaction" key={transaction._id}><span className={transaction.amount < 0 ? "transaction-dot debit" : "transaction-dot"} /><span><strong>{transaction.description}</strong><small>{new Date(transaction.createdAt).toLocaleString()}</small></span><strong className={transaction.amount < 0 ? "transaction-amount debit" : "transaction-amount"}>{transaction.amount < 0 ? "-" : "+"}{formatNaira(Math.abs(transaction.amount))}</strong></div>)}</div>
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
  const schoolLocations = (useQuery(api.rides.listSchoolLocations) ?? []) as Location[];
  const riders = (useQuery(api.users.listRiders) ?? []) as Array<{
    _id: Id<"users">;
    name?: string;
    email?: string;
    phone?: string;
    role: Role;
    walletBalance: number;
    vehicle?: string;
    isOnline?: boolean;
  }>;
  const [pickup, setPickup] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [searchError, setSearchError] = useState("");
  const [pickupSearch, setPickupSearch] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [openSelector, setOpenSelector] = useState<"pickup" | "destination" | null>(null);
  const [bookingStep, setBookingStep] = useState<"details" | "riders" | "review">(
    "details",
  );
  const [selectedRider, setSelectedRider] = useState<
    | {
        _id: Id<"users">;
        name?: string;
        rating?: number;
        vehicle?: string;
        eta: string;
        fare: number;
      }
    | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rideRequested, setRideRequested] = useState(false);
  const [bookingReference, setBookingReference] = useState(() => crypto.randomUUID());
  const [createdRideId, setCreatedRideId] = useState<Id<"rides"> | null>(null);
  const studentRides = (useQuery(api.rides.listMyRides) ?? []) as Ride[];
  const liveRide = createdRideId
    ? studentRides.find((ride) => ride._id === createdRideId) ?? null
    : null;

  const availableRiders = riders.filter(
    (rider) => rider.role === "rider" && rider.isOnline === true,
  );

  useEffect(() => { void ensureLocations({}); }, [ensureLocations]);

  const chooseLocation = (kind: "pickup" | "destination", location: Location) => {
    if (kind === "pickup") setPickup(location); else setDestination(location);
    setOpenSelector(null);
    setSearchError("");
  };

  const filteredLocations = (value: string) => schoolLocations.filter((location) => location.name.toLowerCase().includes(value.trim().toLowerCase()));

  const continueBooking = () => {
    if (!pickup || !destination) return;
    setRideRequested(false);
    setSelectedRider(null);
    setBookingStep("riders");
  };

  const approximateFare = () => {
    const base = 250;
    if (!pickup || !destination) return base;
    const distance = Math.hypot(
      (destination.latitude - pickup.latitude) * 111,
      (destination.longitude - pickup.longitude) * 111,
    );
    return Math.round(Math.max(base, distance * 70 + 180));
  };

  const selectedFare = approximateFare();

  const confirmRideRequest = async () => {
    if (!pickup || !destination || !selectedRider) return;
    setIsSubmitting(true);
    try {
      const rideId = await onBook({
        pickupLocationId: pickup._id,
        destinationLocationId: destination._id,
        riderId: selectedRider._id,
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

      {bookingStep === "review" && selectedRider ? (
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
                <strong>{pickup?.name}</strong>
              </div>
              <div className="detail-row">
                <span>Destination</span>
                <strong>{destination?.name}</strong>
              </div>
              <div className="detail-row">
                <span>Selected rider</span>
                <strong>{selectedRider.name}</strong>
              </div>
              <div className="detail-row">
                <span>Estimated fare</span>
                <strong>₦{selectedFare.toLocaleString()}</strong>
              </div>
            </div>
            <div className="selected-rider-card">
              <div className="rider-profile">
                <span className="rider-avatar">
                  {selectedRider.name?.slice(0, 2).toUpperCase() ?? "A9"}
                </span>
                <div>
                  <strong>{selectedRider.name}</strong>
                  <small>{selectedRider.vehicle ?? "Bike / motorcycle"}</small>
                </div>
              </div>
              <div className="rider-meta">
                <span>Rating: {selectedRider.rating?.toFixed(1) ?? "New"}</span>
                <span>ETA: {selectedRider.eta}</span>
              </div>
            </div>
          </div>
          <div className="review-actions">
            {searchError && <p className="payment-error" role="alert">{searchError}</p>}
            <button
              className="secondary-button"
              onClick={() => setBookingStep("riders")}
              type="button"
            >
              Back to riders
            </button>
            <button
              className="primary-button"
              onClick={confirmRideRequest}
              disabled={isSubmitting}
              type="button"
            >
              {isSubmitting ? "Creating ride request..." : "Confirm Ride"} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : bookingStep === "riders" ? (
        <div className="rider-results">
          <div className="section-heading rider-heading">
            <div>
              <span className="eyebrow">Available riders</span>
              <h3>Here are the riders available for your trip.</h3>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setBookingStep("details")}
            >
              Change location
            </button>
          </div>

          {availableRiders.length === 0 ? (
            <div className="empty-rider-state">
              <Bike size={30} />
              <div>
                <h4>No riders are currently available nearby.</h4>
                <p>
                  Try again in a moment, update your pickup or destination, or go
                  back and adjust your trip details.
                </p>
                <div className="empty-state-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setBookingStep("details")}
                  >
                    Return to booking
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rider-list">
              {availableRiders.map((rider) => {
                const riderCard = {
                  _id: rider._id,
                  name: rider.name ?? "Rider",
                  rating: 4.8,
                  vehicle: rider.vehicle ?? "Bike / motorcycle",
                  eta: "3-6 min",
                  fare: selectedFare,
                };
                return (
                  <div className="rider-card" key={rider._id}>
                    <div className="rider-profile">
                      <span className="rider-avatar">
                        {(rider.name ?? "R").slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{riderCard.name}</strong>
                        <small>{riderCard.vehicle}</small>
                      </div>
                    </div>
                    <div className="rider-meta">
                      <span>Rating: {riderCard.rating.toFixed(1)}</span>
                      <span>ETA: {riderCard.eta}</span>
                      <span>Distance: 1.2 km</span>
                      <span>Fare: ₦{riderCard.fare.toLocaleString()}</span>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setSelectedRider(riderCard);
                        setBookingStep("review");
                      }}
                    >
                      Select rider
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : rideRequested ? (
        <div className="success-card">
          <div className="success-icon">✓</div>
          <h3>Ride booked successfully</h3>
          <p>
            {selectedRider?.name} has been assigned to your trip from {pickup?.name}{" "}
            to {destination?.name}. {liveRide?.status === "accepted" ? "Your rider accepted the request." : "Waiting for the rider to respond."}
          </p>
          {liveRide && <div className="ride-live-summary"><span>Live status</span><strong>{liveRide.status === "requested" ? "Waiting for Rider" : statusLabels[liveRide.status]}</strong><span>Ride Fare</span><strong>{formatNaira(liveRide.fare)}</strong><span>Payment Status</span><strong>No payment taken yet</strong></div>}
          <div className="ride-payment-panel"><span className="eyebrow">A9 wallet payment</span><p className="payment-success"><CheckCircle2 size={16} /> Ride request created</p><strong>{formatNaira(liveRide?.fare ?? selectedFare)} is reserved for reference only</strong><p className="payment-help">No payment has been processed yet. The fare will be secured only after a rider accepts.</p></div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setBookingStep("details");
              setSelectedRider(null);
              setRideRequested(false);
              setCreatedRideId(null);
            }}
          >
            Book another trip
          </button>
        </div>
      ) : (
        <div className="booking-layout">
          <div className="booking-card booking-form-card">
            <div className="school-location-stack">
              {(["pickup", "destination"] as const).map((kind) => {
                const selected = kind === "pickup" ? pickup : destination;
                const searchValue = kind === "pickup" ? pickupSearch : destinationSearch;
                const setSearchValue = kind === "pickup" ? setPickupSearch : setDestinationSearch;
                const options = filteredLocations(searchValue).filter((location) => location._id !== (kind === "pickup" ? destination?._id : pickup?._id));
                return <div className={`school-location-selector ${openSelector === kind ? "open" : ""}`} key={kind}>
                  <label>{kind === "pickup" ? "Pickup location" : "Destination"}</label>
                  <button type="button" className="school-location-trigger" onClick={() => setOpenSelector(openSelector === kind ? null : kind)}>
                    <MapPin size={17} /><span>{selected?.name ?? `Choose ${kind} location`}</span><ChevronDown size={17} />
                  </button>
                  {openSelector === kind && <div className="school-location-menu">
                    <div className="school-location-search"><Search size={16} /><input autoFocus value={searchValue} placeholder={`Search ${kind} location`} onChange={(event) => setSearchValue(event.target.value)} /></div>
                    <div className="school-location-options">{options.map((location) => <button type="button" key={location._id} className={selected?._id === location._id ? "selected" : ""} onClick={() => chooseLocation(kind, location)}><MapPin size={15} /><span>{location.name}</span></button>)}{options.length === 0 && <small>No matching school location.</small>}</div>
                  </div>}
                </div>;
              })}
            </div>
            {searchError && <small className="location-note location-note--unavailable">{searchError}</small>}

            <button
              type="button"
              className="primary-button full"
              onClick={continueBooking}
              disabled={!pickup || !destination}
            >
              Continue / Find available riders <ArrowRight size={18} />
            </button>

            <small className="location-note">Choose from A9 school stops so riders and students share the same clear campus locations.</small>
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
  earnings: any;
  payoutHistory: Array<any>;
  onAccept: (id: Id<"rides">) => void;
  onDecline: (id: Id<"rides">) => void;
  onStatus: (id: Id<"rides">, status: Status) => void;
  onToggleAvailability: (isOnline: boolean) => void;
  onOpenVerification: () => void;
  onRequestPayout: (amount: number) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }>;
}) {
  const status = (account.verificationStatus ?? "not_verified") as VerificationStatus;
  const isOnline = account.isOnline === true;
  const activeRide = assignedRides.find((ride) => ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(ride.status));
  const completedRides = assignedRides.filter((ride) => ride.status === "completed");
  const totalEarnings = earnings?.total ?? 0;
  const todayEarnings = earnings?.today ?? 0;
  const availableForPayout = earnings?.availableForPayout ?? 0;
  const pendingEarnings = earnings?.pending ?? 0;
  const paidOut = earnings?.paid ?? 0;
  const leadRequest = requests[0];
  const additionalRequestCount = Math.max(0, requests.length - 1);
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

      <section className={isOnline ? "rider-command-status online" : "rider-command-status"}><div><span className="eyebrow">Pickup status</span><strong>{isOnline ? "Ready for Pickup" : "Offline"}</strong><p>{isOnline ? "You are visible for new ride requests." : "Go online when you are ready to receive requests."}</p></div><button className="rider-status-action" type="button" onClick={() => onToggleAvailability(!isOnline)}>{isOnline ? "Go Offline" : "Go Online"} <ArrowRight size={17} /></button></section>

      <div className="rider-command-grid">
        <main className="rider-command-primary">
          <section className="rider-command-panel rider-command-ride-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">{activeRide ? "On the move" : "Live requests"}</span><h2>{activeRide ? "Active ride" : "Incoming ride"}</h2></div>{additionalRequestCount > 0 && <span className="rider-request-count">+{additionalRequestCount} waiting</span>}</div>{activeRide ? <RiderActiveRide ride={activeRide} onStatus={onStatus} /> : leadRequest ? <RiderRequestCard ride={leadRequest} onAccept={onAccept} onDecline={onDecline} /> : <RiderEmptyState title={isOnline ? "No requests right now" : "You are offline"} message={isOnline ? "New requests will appear here in real time." : "Go online to receive your next request."} />}</section>
          {leadRequest && !activeRide && additionalRequestCount > 0 && <button className="rider-more-requests" type="button">View {additionalRequestCount} more request{additionalRequestCount === 1 ? "" : "s"} <ArrowRight size={15} /></button>}
          <section className="rider-command-panel rider-recent-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">Trip history</span><h2>Recent rides</h2></div><span className="rider-view-label">{recentCompleted.length > 0 ? "Latest" : "Empty"}</span></div>{recentCompleted.length > 0 ? <div className="rider-recent-list">{recentCompleted.map((ride) => <div className="rider-recent-row" key={ride._id}><span className="rider-recent-icon"><Check size={15} /></span><span><strong>{ride.pickupLabel} <em>to</em> {ride.destinationLabel}</strong><small>{new Date(ride.requestedAt).toLocaleDateString()}</small></span><strong>{formatNaira(ride.fare)}</strong></div>)}</div> : <RiderEmptyState title="No completed rides yet" message="Your ride history will appear here after your first trip." />}</section>
        </main>
        <aside className="rider-command-side">
          <section className="rider-command-panel rider-confidence-panel"><span className="rider-safety-icon"><ShieldCheck size={18} /></span><div><strong>Drive with confidence</strong><p>Your rider account is verified for the A9 network.</p></div></section>
          <section className="rider-command-panel rider-finance-panel"><div className="rider-command-panel-heading"><div><span className="eyebrow">Performance</span><h2>Financial overview</h2></div><span className="rider-earnings-mark">₦</span></div><div className="rider-hero-earning">{formatNaira(todayEarnings)}<small>today</small></div><div className="rider-earnings-periods"><div><span>Total earnings</span><strong>{formatNaira(totalEarnings)}</strong></div><div><span>Available for payout</span><strong>{formatNaira(availableForPayout)}</strong></div><div><span>Pending earnings</span><strong>{formatNaira(pendingEarnings)}</strong></div><div><span>Paid out</span><strong>{formatNaira(paidOut)}</strong></div></div><RiderPayoutRequestCard available={availableForPayout} onRequestPayout={onRequestPayout} account={account} /><div className="rider-finance-groups"><div className="rider-finance-group"><div className="rider-finance-header"><span className="eyebrow">Ledger</span><h3>Earnings history</h3></div>{historyEntries.length ? <div className="rider-history-list">{visibleEarnings.map((entry: any) => <div className="rider-earning-row" key={entry._id}><div><strong>Ride {String(entry.rideId).slice(-7)}</strong><small>{new Date(entry.completedAt).toLocaleDateString()} · Fare ₦{entry.grossFare.toLocaleString()} · Fee ₦{entry.platformFee.toLocaleString()}</small></div><span><strong>₦{entry.riderEarnings.toLocaleString()}</strong><small>{entry.status === "eligible" ? "Eligible" : entry.status[0].toUpperCase() + entry.status.slice(1)}</small></span></div>)}</div> : <p className="settings-muted">Completed paid rides will appear here.</p>}{historyEntries.length > 5 && <button className="rider-see-more" type="button" onClick={() => setExpandEarnings((value) => !value)}>{expandEarnings ? "Show less" : "See more"}</button>}</div><div className="rider-finance-group"><div className="rider-finance-header"><span className="eyebrow">Payout</span><h3>Payout history</h3></div>{payoutEntries.length ? <div className="rider-history-list">{visiblePayouts.map((entry: any) => <div className="rider-earning-row" key={entry._id}><div><strong>{formatNaira(entry.amount)}</strong><small>{new Date(entry.requestedAt ?? entry.createdAt).toLocaleDateString()}</small></div><span><strong>{entry.status}</strong><small>{entry.reference.slice(-8)}</small></span></div>)}</div> : <p className="settings-muted">No payout requests yet.</p>}{payoutEntries.length > 5 && <button className="rider-see-more" type="button" onClick={() => setExpandPayouts((value) => !value)}>{expandPayouts ? "Show less" : "See more"}</button>}</div></div><div className="rider-compact-stats"><div><strong>{earnings?.completedRides ?? 0}</strong><span>Completed rides</span></div><div><strong>{formatNaira(earnings?.week ?? 0)}</strong><span>This week</span></div><div><strong>{formatNaira(earnings?.month ?? 0)}</strong><span>This month</span></div><div><strong>NGN</strong><span>Currency</span></div></div></section>
        </aside>
      </div>
    </div>
  );
}

function RiderSectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="rider-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>;
}

function RiderRequestCard({ ride, onAccept, onDecline }: { ride: Ride; onAccept: (id: Id<"rides">) => void; onDecline: (id: Id<"rides">) => void }) {
  return <article className="rider-request-card"><div className="rider-request-top"><span className="ride-status-pill"><span />New request</span><strong>{formatNaira(ride.fare)}</strong></div><div className="rider-request-route"><div><small>Pickup</small><strong>{ride.pickupLabel}</strong></div><ArrowRight size={17} /><div><small>Destination</small><strong>{ride.destinationLabel}</strong></div></div><div className="rider-request-meta"><span><Clock3 size={14} /> {new Date(ride.requestedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span><MapPin size={14} /> Student request</span></div><div className="rider-request-actions"><button className="secondary-button" type="button" onClick={() => onDecline(ride._id)}>Decline</button><button className="primary-button" type="button" onClick={() => onAccept(ride._id)}>Accept Ride <Check size={16} /></button></div></article>;
}

function RiderActiveRide({ ride, onStatus }: { ride: Ride; onStatus: (id: Id<"rides">, status: Status) => void }) {
  const nextStatus: Status | null = ride.status === "accepted" ? "rider_arriving" : ride.status === "rider_arriving" ? "in_progress" : ride.status === "in_progress" ? "awaiting_confirmation" : null;
  const nextLabel = ride.status === "accepted" ? "Start arrival" : ride.status === "rider_arriving" ? "Start ride" : "Complete Ride";
  const paymentConfirmed =
    ride.paymentStatus === "paid" ||
    ride.paymentStage === "paid_held" ||
    ride.paymentStage === "awaiting_completion" ||
    ride.paymentStage === "eligible_for_rider" ||
    ride.paymentStage === "pending_payout" ||
    ride.paymentStage === "paid_to_rider";
  const paymentBlocked = nextStatus === "awaiting_confirmation" && !paymentConfirmed;
  return <div className="rider-active-card"><div className="rider-request-top"><span className="ride-status-pill"><span />{statusLabels[ride.status]}</span><strong>{formatNaira(ride.fare)}</strong></div><div className="rider-active-route"><div><small>Student</small><strong>{ride.studentName ?? "Student"}</strong></div><ArrowRight size={18} /><div><small>Destination</small><strong>{ride.destinationLabel}</strong></div></div><div className={paymentConfirmed ? "ride-payment-confirmed" : "ride-payment-required"}><strong>{paymentConfirmed ? "Payment Confirmed" : "Payment Required"}</strong><span>{paymentConfirmed ? `${formatNaira(ride.paymentAmount ?? ride.fare)} secured by A9` : "Student payment has not been confirmed."}</span></div><div className="rider-active-footer"><span>{ride.status === "awaiting_confirmation" ? "Waiting for Student Confirmation" : paymentBlocked ? "Payment must be confirmed before completion" : "Payment secured · Ready for trip"}</span>{nextStatus && <button className="primary-button" type="button" onClick={() => onStatus(ride._id, nextStatus)} disabled={paymentBlocked}>{paymentBlocked ? "Payment required" : <>{nextLabel} <ArrowRight size={16} /></>}</button>}</div></div>;
}

function RiderPayoutRequestCard({ available, onRequestPayout, account }: { available: number; onRequestPayout: (amount: number) => Promise<{ payoutId: Id<"payouts">; amount: number; bankName: string; accountNumber: string; accountName: string }>; account: any; }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.max(0, available)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const bank = account.payoutBankName ?? "Not set";
  const accountNumber = account.payoutAccountNumber ?? "Not set";
  const accountName = account.payoutAccountName ?? "Not set";
  const safeAmount = Number(amount || 0);
  return (
    <div className="rider-payout-card">
      <div className="rider-payout-header"><span className="eyebrow">Cash out</span><strong>{formatNaira(available)}</strong></div>
      {open ? (
        <div className="rider-payout-panel">
          <div className="rider-payout-row"><span>Available balance</span><strong>{formatNaira(available)}</strong></div>
          <label><span>Amount to withdraw</span><input type="number" min="1" max={available} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <div className="rider-payout-row"><span>Registered bank</span><strong>{bank}</strong></div>
          <div className="rider-payout-row"><span>Account</span><strong>{accountNumber ? `****${String(accountNumber).slice(-4)}` : "Not set"}</strong></div>
          {message && <p className="settings-feedback success">{message}</p>}
          <button className="primary-button" type="button" disabled={!available || safeAmount <= 0 || safeAmount > available || busy} onClick={async () => { setBusy(true); setMessage(""); try { await onRequestPayout(safeAmount); setMessage("Payout request submitted. Admin review is pending."); setOpen(false); } catch (error) { setMessage(error instanceof Error ? error.message : "Payout request could not be created."); } finally { setBusy(false); } }}>{busy ? "Submitting..." : "Request Payout"}</button>
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
  const [matricNumber, setMatricNumber] = useState(account.matricNumber ?? "");
  const [faculty, setFaculty] = useState(account.faculty ?? "");
  const [department, setDepartment] = useState(account.department ?? "");
  const [vehicle, setVehicle] = useState(account.vehicle ?? "");
  const [plateNumber, setPlateNumber] = useState(account.plateNumber ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [payoutBankName, setPayoutBankName] = useState(account.payoutBankName ?? "");
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
        ...(isStudent ? { matricNumber, faculty, department } : { vehicle, plateNumber, payoutBankName, payoutAccountNumber, payoutAccountName }),
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
      <div className="settings-heading"><div><span className="eyebrow">A9 account</span><h1>Profile & settings</h1><p>Keep your account details current and your access secure.</p></div><div className="settings-profile-summary"><span className="settings-avatar">{account.name?.slice(0, 2).toUpperCase() ?? "A9"}</span><div><strong>{account.name}</strong><span>{isStudent ? "Student account" : "Rider account"}</span></div></div></div>
      <div className="settings-layout">
        <div className="settings-main-column">
          <section className="settings-card settings-profile-card">
            <div className="settings-card-heading"><div><span className="eyebrow">Profile</span><h2>Personal information</h2></div><span className="settings-role-badge">{isStudent ? "Student" : "Rider"}</span></div>
            <div className="settings-form-grid">
              <label><span>Full name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label><span>Email address</span><input value={account.email ?? ""} readOnly /></label>
              <label><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              {isStudent ? <>
                <label><span>Matriculation number</span><input value={matricNumber} onChange={(event) => setMatricNumber(event.target.value)} /></label>
                <label><span>Faculty / school</span><input value={faculty} onChange={(event) => setFaculty(event.target.value)} /></label>
                <label><span>Department</span><input value={department} onChange={(event) => setDepartment(event.target.value)} /></label>
              </> : <>
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
          <section className="settings-card settings-account-card"><span className="eyebrow">Account</span><div className="settings-account-row"><span>Role</span><strong>{isStudent ? "Student" : "Rider"}</strong></div><div className="settings-account-row"><span>Email</span><strong>{account.email}</strong></div><div className="settings-account-row"><span>Access</span><strong>Verified A9 account</strong></div></section>
          {!isStudent && (
            <section className="settings-card">
              <div className="settings-card-heading"><div><span className="eyebrow">Payout account</span><h2>Bank details</h2></div></div>
              <div className="settings-form-stack">
                <label><span>Bank</span><input value={payoutBankName} onChange={(event) => setPayoutBankName(event.target.value)} placeholder="e.g. Access Bank" /></label>
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
  const riders = (useQuery(api.users.listVerificationSubmissions, {}) ?? []) as Array<{
    _id: Id<"users">;
    name?: string;
    email?: string;
    phone?: string;
    verificationStatus?: VerificationStatus;
    verificationSubmittedAt?: number;
  }>;
  const adminEarnings = useQuery(api.earnings.getAdminEarningsSummary) ?? [];
  const completionRides = useQuery(api.rides.listAdminCompletionRides) ?? [];
  const financialRecords = useQuery(api.payments.getAdminFinancialRecords) ?? [];
  const paymentPool = useQuery(api.payments.getPaymentPoolSummary);
  const reviewVerification = useMutation(api.users.reviewVerification);
  const approvePayout = useMutation(api.payments.approvePayoutRequest);
  const rejectPayout = useMutation(api.payments.rejectPayoutRequest);
  const markPayoutPaid = useMutation(api.payments.markPayoutPaid);
  const payoutRequests = useQuery(api.payments.getPayoutRequests) ?? [];
  const [filter, setFilter] = useState<"all" | VerificationStatus>("under_review");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const [payoutId, setPayoutId] = useState<Id<"payouts"> | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"verification" | "payments">("verification");
  const selected = useQuery(api.users.getVerificationDetails, selectedId ? { riderId: selectedId } : "skip");
  const selectedPayout = payoutRequests.find((item: any) => item._id === payoutId) ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRiders = riders.filter((rider) => {
    const status = rider.verificationStatus ?? "not_verified";
    const matchesFilter = filter === "all" || status === filter;
    const matchesSearch = !normalizedSearch || [rider.name, rider.email, rider.phone].some((value) => value?.toLowerCase().includes(normalizedSearch));
    return matchesFilter && matchesSearch;
  });
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
  const statusLabel = (status: VerificationStatus) => status === "approved" ? "Verified" : status === "under_review" ? "Under Review" : status === "rejected" ? "Rejected" : "Not Verified";
  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div><span className="eyebrow"><ShieldCheck size={14} /> A9 operations</span><h1>Rider verification</h1><p>Review rider identity submissions and manage access to ride requests.</p></div>
        <span className="admin-profile-chip"><span className="avatar">{account.name?.slice(0, 2).toUpperCase() ?? "A9"}</span>{account.name ?? "Administrator"}</span>
      </header>
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
      {activeTab === "verification" && (
        <>
          <section className="admin-verification-card"><div className="admin-section-heading"><div><span className="eyebrow">Rider verification</span><h2>Verification queue</h2></div><span className="admin-live-label"><span /> Live database</span></div><div className="admin-toolbar"><div className="admin-filters">{(["all", "under_review", "approved", "rejected", "not_verified"] as const).map((value) => <button key={value} className={filter === value ? "admin-filter active" : "admin-filter"} type="button" onClick={() => setFilter(value)}>{value === "all" ? "All" : statusLabel(value)}</button>)}</div><input className="admin-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or email" aria-label="Search riders" /></div><div className="admin-rider-list">{visibleRiders.length === 0 ? <div className="admin-empty"><ShieldCheck size={22} /><strong>No riders match this view</strong><span>New submissions will appear here automatically.</span></div> : visibleRiders.map((rider) => { const status = (rider.verificationStatus ?? "not_verified") as VerificationStatus; return <div className="admin-rider-row" key={rider._id}><span className="admin-rider-avatar">{rider.name?.slice(0, 2).toUpperCase() ?? "A9"}</span><div className="admin-rider-identity"><strong>{rider.name ?? "Unnamed rider"}</strong><span>{rider.phone ?? "No phone"} · {rider.email ?? "No email"}</span></div><span className={`verification-badge verification-badge--${status === "approved" ? "success" : status === "rejected" ? "danger" : status === "under_review" ? "warning" : "neutral"}`}>{statusLabel(status)}</span><span className="admin-submitted-date">{rider.verificationSubmittedAt ? new Date(rider.verificationSubmittedAt).toLocaleDateString() : "—"}</span><button className="secondary-button admin-review-button" type="button" onClick={() => { setSelectedId(rider._id); setMessage(""); }}>Review <ArrowRight size={15} /></button></div>; })}</div></section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ledger visibility</span><h2>Rider earnings</h2></div><span className="admin-live-label"><span /> Live rider balances</span></div>{adminEarnings.length === 0 ? <div className="admin-empty"><strong>No completed ride earnings yet</strong><span>Eligible earnings appear after a paid ride is completed.</span></div> : <div className="admin-earnings-list">{adminEarnings.map((entry: any) => <div className="admin-earnings-row" key={entry.riderId}><div><strong>{entry.riderName ?? "Unnamed rider"}</strong><span>{entry.completedRides} completed ride{entry.completedRides === 1 ? "" : "s"}</span></div><div><span>Total eligible</span><strong>₦{entry.totalEligible.toLocaleString()}</strong></div><div><span>Pending</span><strong>₦{entry.pending.toLocaleString()}</strong></div><div><span>Paid</span><strong>₦{entry.paid.toLocaleString()}</strong></div></div>)}</div>}</section>
          <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ride audit</span><h2>Completion review</h2></div><span className="admin-live-label"><span /> Confirmation required</span></div>{completionRides.length === 0 ? <div className="admin-empty"><strong>No completion events yet</strong><span>Awaiting, completed, and disputed rides will appear here.</span></div> : <div className="admin-earnings-list">{completionRides.map((ride: any) => <div className="admin-earnings-row" key={ride._id}><div><strong>{ride.studentName ?? "Student"} → {ride.riderName ?? "Unassigned"}</strong><span>{ride.destinationLabel ?? "Destination unavailable"}</span></div><div><span>Status</span><strong>{ride.status === "awaiting_confirmation" ? "Awaiting confirmation" : ride.status[0].toUpperCase() + ride.status.slice(1)}</strong></div><div><span>Confirmed by</span><strong>{ride.confirmedByName ?? "—"}</strong></div><div><span>Issue / time</span><strong>{ride.disputeReason ?? (ride.completionConfirmedAt ? new Date(ride.completionConfirmedAt).toLocaleString() : "—")}</strong></div></div>)}</div>}</section>
        </>
      )}
      {activeTab === "payments" && (
        <>
          <section className="admin-verification-card admin-payment-pool"><div className="admin-section-heading"><div><span className="eyebrow">A9 escrow ledger</span><h2>Payment Pool</h2></div><span className="admin-live-label"><span /> Live NGN balance</span></div><div className="admin-summary-grid admin-pool-grid"><AdminMetric label="Total payment pool" value={formatNaira(paymentPool?.total ?? 0)} tone="total" /><AdminMetric label="Held for active rides" value={formatNaira(paymentPool?.held ?? 0)} tone="pending" /><AdminMetric label="Rider earnings" value={formatNaira(paymentPool?.eligible ?? 0)} tone="approved" /><AdminMetric label="Pending payouts" value={formatNaira(paymentPool?.pendingPayout ?? 0)} tone="pending" /><AdminMetric label="Paid to riders" value={formatNaira(paymentPool?.paid ?? 0)} tone="approved" /><AdminMetric label="Refunded" value={formatNaira(paymentPool?.refunded ?? 0)} tone="rejected" /><AdminMetric label="Disputed" value={formatNaira(paymentPool?.disputed ?? 0)} tone="rejected" /></div>{paymentPool?.records.length ? <div className="admin-earnings-list">{paymentPool.records.slice(0, 30).map((record) => <div className="admin-earnings-row" key={String(record.paymentId)}><div><strong>Ride {String(record.rideId).slice(-8)}</strong><span>{record.studentName ?? "Student"} → {record.riderName ?? "Unassigned"}</span></div><div><span>Amount</span><strong>{formatNaira(record.amount)}</strong></div><div><span>Payment</span><strong>{record.paymentStage.replaceAll("_", " ")}</strong></div><div><span>Ride / payout</span><strong>{record.rideStatus} / {record.payoutStatus}</strong></div>{record.payoutId && record.payoutStatus !== "paid" && <button className="secondary-button" type="button" onClick={() => void markPayoutPaid({ payoutId: record.payoutId! })}>Mark payout paid</button>}</div>)}</div> : <div className="admin-empty"><strong>No ride-payment records yet</strong><span>Paid ride funds will appear here as held escrow records.</span></div>}</section>
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
      <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Ride audit</span><h2>Completion review</h2></div><span className="admin-live-label"><span /> Confirmation required</span></div>{completionRides.length === 0 ? <div className="admin-empty"><strong>No completion events yet</strong><span>Awaiting, completed, and disputed rides will appear here.</span></div> : <div className="admin-earnings-list">{completionRides.map((ride: any) => <div className="admin-earnings-row" key={ride._id}><div><strong>{ride.studentName ?? "Student"} → {ride.riderName ?? "Unassigned"}</strong><span>{ride.destinationLabel ?? "Destination unavailable"}</span></div><div><span>Status</span><strong>{ride.status === "awaiting_confirmation" ? "Awaiting confirmation" : ride.status[0].toUpperCase() + ride.status.slice(1)}</strong></div><div><span>Confirmed by</span><strong>{ride.confirmedByName ?? "—"}</strong></div><div><span>Issue / time</span><strong>{ride.disputeReason ?? (ride.completionConfirmedAt ? new Date(ride.completionConfirmedAt).toLocaleString() : "—")}</strong></div></div>)}</div>}</section>
      <section className="admin-verification-card admin-earnings-card"><div className="admin-section-heading"><div><span className="eyebrow">Money ledger</span><h2>Financial activity</h2></div><span className="admin-live-label"><span /> NGN records</span></div>{financialRecords.length === 0 ? <div className="admin-empty"><strong>No financial records yet</strong><span>Funding, ride payments, withdrawals, and earnings will appear here.</span></div> : <div className="admin-earnings-list">{financialRecords.slice(0, 30).map((record: any) => <div className="admin-earnings-row" key={`${record.kind}-${record.reference}`}><div><strong>{record.kind.replace("_", " ")}</strong><span>{record.userName ?? "Account unavailable"} · {new Date(record.createdAt).toLocaleDateString()}</span></div><div><span>Amount</span><strong>{formatNaira(record.amount)}</strong></div><div><span>Reference</span><strong>{record.reference.slice(-18)}</strong></div><div><span>Status</span><strong>{record.status[0].toUpperCase() + record.status.slice(1)}</strong></div></div>)}</div>}</section>
      {message && <p className="settings-feedback" role="status">{message}</p>}
      {selectedId && selected && <div className="admin-review-overlay" role="dialog" aria-modal="true"><section className="admin-review-panel"><div className="admin-review-heading"><div><span className="eyebrow">Secure review</span><h2>{selected.name ?? "Rider verification"}</h2><p>{selected.email ?? selected.phone ?? "No contact details"}</p></div><button className="icon-close-button" type="button" onClick={closeReview} aria-label="Close review"><X size={20} /></button></div><div className="admin-detail-grid"><div><h3>Rider information</h3><AdminDetail label="Phone" value={selected.phone} /><AdminDetail label="Date of birth" value={selected.verificationDateOfBirth} /><AdminDetail label="Address" value={selected.verificationAddress} /><AdminDetail label="Emergency contact" value={[selected.verificationEmergencyName, selected.verificationEmergencyPhone].filter(Boolean).join(" · ")} /></div><div><h3>Identity verification</h3><AdminDetail label="ID type" value={selected.verificationIdType?.replace("_", " ")} /><AdminDetail label="ID number" value={selected.verificationIdNumber} /><div className="admin-document-grid">{selected.idDocumentUrl && (selected.idDocumentContentType === "application/pdf" ? <a className="admin-pdf-preview" href={selected.idDocumentUrl} target="_blank" rel="noreferrer"><FileText size={24} /><span>Open government ID PDF</span></a> : <a href={selected.idDocumentUrl} target="_blank" rel="noreferrer"><img src={selected.idDocumentUrl} alt="Government ID document" /></a>)}{selected.selfieUrl && <a href={selected.selfieUrl} target="_blank" rel="noreferrer"><img src={selected.selfieUrl} alt="Rider selfie" /></a>}</div></div></div>{selected.verificationRejectionReason && <div className="admin-rejection-note"><strong>Previous rejection reason</strong><span>{selected.verificationRejectionReason}</span></div>}<div className="admin-review-actions">{selected.verificationStatus !== "approved" && <button className="primary-button" type="button" onClick={() => setDecision("approved")}>Approve Verification <Check size={16} /></button>}{selected.verificationStatus !== "rejected" && <button className="admin-danger-button" type="button" onClick={() => setDecision("rejected")}>Reject Verification <X size={16} /></button>}</div></section></div>}
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
      answer: "The rider does not receive the money immediately after accepting. The fare remains secured by A9 until the ride is completed and the student confirms completion. It then becomes part of the rider's earnings.",
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
        A9 uses verified school stops so students and riders share the same clear
        pickup and destination locations.
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
