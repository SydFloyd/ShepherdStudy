"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthStatus } from "@/hooks/use-auth-status";
import { parseJsonSafe } from "@/lib/study-client-utils";

type AccountPayload = {
  account: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
};

export default function AccountPage() {
  const router = useRouter();
  const { status } = useAuthStatus();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (status !== "authenticated") {
      return;
    }

    async function loadAccount() {
      setIsLoading(true);
      const response = await fetch("/api/account", { cache: "no-store" });
      const data = (await parseJsonSafe(response)) as AccountPayload | { error?: string };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (response.status === 404) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok || !("account" in data)) {
        setError(("error" in data && data.error) || "Unable to load account.");
        setIsLoading(false);
        return;
      }

      setEmail(data.account.email);
      setName(data.account.name ?? "");
      setCreatedAt(new Date(data.account.createdAt).toLocaleString());
      setIsLoading(false);
    }

    void loadAccount();
  }, [router, status]);

  async function onSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    const data = (await parseJsonSafe(response)) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to update profile.");
      setIsSavingProfile(false);
      return;
    }

    setMessage("Profile updated.");
    setIsSavingProfile(false);
  }

  async function onChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingPassword(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    const data = (await parseJsonSafe(response)) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to update password.");
      setIsSavingPassword(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password updated.");
    setIsSavingPassword(false);
  }

  async function onDeleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDeleting(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: deletePassword,
        confirm: deleteConfirm
      })
    });

    const data = (await parseJsonSafe(response)) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to delete account.");
      setIsDeleting(false);
      return;
    }

    await signOut({ callbackUrl: "/" });
  }

  if (status === "loading" || isLoading) {
    return (
      <section className="card">
        <h1>Account</h1>
        <p className="muted">Loading account...</p>
      </section>
    );
  }

  if (status !== "authenticated") {
    return (
      <section className="card">
        <h1>Account</h1>
        <p className="muted">Please sign in to access account settings.</p>
      </section>
    );
  }

  return (
    <section className="grid">
      <article className="card">
        <h1>Account</h1>
        <p className="muted">Email: {email}</p>
        <p className="muted">Member since: {createdAt}</p>
      </article>

      <article className="card">
        <h2>Profile</h2>
        <form className="grid" onSubmit={onSaveProfile}>
          <label>
            Display name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" disabled={isSavingProfile}>
            {isSavingProfile ? "Saving..." : "Save profile"}
          </button>
        </form>
      </article>

      <article className="card">
        <h2>Password</h2>
        <form className="grid" onSubmit={onChangePassword}>
          <label>
            Current password
            <input
              value={currentPassword}
              type="password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              value={newPassword}
              type="password"
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isSavingPassword}>
            {isSavingPassword ? "Saving..." : "Change password"}
          </button>
        </form>
      </article>

      <article className="card">
        <h2>Delete account</h2>
        <p className="muted">
          This permanently deletes your account and all saved study history.
        </p>
        <form className="grid" onSubmit={onDeleteAccount}>
          <label>
            Current password
            <input
              value={deletePassword}
              type="password"
              onChange={(event) => setDeletePassword(event.target.value)}
              required
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete account"}
          </button>
        </form>
      </article>

      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="muted">{error}</p> : null}
    </section>
  );
}
