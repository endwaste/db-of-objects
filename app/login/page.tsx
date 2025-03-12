"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";

// Keep the API_URL logic:
const API_URL = (() => {
  switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    case "development":
      return process.env.NEXT_PUBLIC_DEVELOPMENT_URL || "http://localhost:8000";
    case "production":
      return (
        process.env.NEXT_PUBLIC_PRODUCTION_URL ||
        "http://ec2-44-243-22-197.us-west-2.compute.amazonaws.com:8000"
      );
    default:
      return "http://localhost:8000";
  }
})();

export default function LoginPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    axios
      .get(`${API_URL}/api/auth/user`, { withCredentials: true })
      .then((response) => {
        if (response.data.email) {
          router.push("/");
        }
      })
      .catch((err) => {
        // Not authenticated; do nothing.
      })
      .finally(() => {
        setCheckingAuth(false);
      });
  }, [router]);

  const handleLogin = () => {
    window.location.href = `${API_URL}/api/auth/login`;
  };

  if (checkingAuth) return <p>Checking authentication…</p>;

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-100 pt-10 mt-30">
      <img
        src="https://endwaste.io/assets/logo_footer.png"
        alt="Glacier Logo"
        style={{
          width: "80px",
          height: "auto",
          marginBottom: "0.5rem",
          marginTop: "3rem",
          display: "block",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      />
      <h1 className="font-sans text-4xl mb-10" style={{ color: "#466CD9" }}>
        Universal database of objects
      </h1>
      <button
        onClick={handleLogin}
        className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-700"
      >
        Login with Google
      </button>
    </div>
  );
}
