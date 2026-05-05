'use client';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex w-9 h-5 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        enabled ? 'bg-primary' : 'bg-secondary'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
        } mt-[2px]`}
      />
    </button>
  );
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function InfoField({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="w-full bg-secondary/40 border border-border/50 rounded-xl text-sm px-3.5 py-2.5 text-foreground min-h-[40px] flex items-center">
        {value || <span className="text-muted-foreground/40">{placeholder || 'Not set'}</span>}
      </div>
    </div>
  );
}

export function ClientProfile() {
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
    tradeAlerts: true,
  });

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 pb-16">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile, preferences, and security settings</p>
      </div>

      {/* Profile Card */}
      <div className="bg-card border border-border rounded-2xl card-modern p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="relative flex items-center gap-5">
          <div className="w-[72px] h-[72px] rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <span className="text-2xl font-bold text-white no-select">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-foreground truncate">{user?.name || 'Trader'}</h2>
              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-buy/10 text-buy font-semibold">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{user?.email || 'trader@example.com'}</p>
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold">
                Standard Account
              </span>
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground font-medium">
                Member since 2024
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="bg-card border border-border rounded-2xl card-modern p-6">
        <SectionHeader
          icon={
            <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
          title="Personal Information"
          description="Your account details and contact information"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Full Name" value={user?.name || ''} placeholder="Not provided" />
          <InfoField label="Email Address" value={user?.email || ''} placeholder="Not provided" />
          <InfoField label="Phone Number" value="" placeholder="Not set" />
          <InfoField label="Country" value="" placeholder="Not set" />
        </div>
        <div className="mt-4 pt-4 border-t border-border/50">
          <button className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            Request profile update
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-card border border-border rounded-2xl card-modern p-6">
        <SectionHeader
          icon={
            <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          }
          title="Appearance"
          description="Customize the look and feel of your trading platform"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground font-medium">Theme</span>
            <span className="text-xs text-muted-foreground">Switch between light and dark mode</span>
          </div>
          <div className="flex bg-secondary/60 rounded-xl p-1 gap-1">
            <button
              onClick={() => { if (theme !== 'light') toggleTheme(); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg font-medium transition-all duration-200 ${
                theme === 'light'
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
              Light
            </button>
            <button
              onClick={() => { if (theme !== 'dark') toggleTheme(); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg font-medium transition-all duration-200 ${
                theme === 'dark'
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
              Dark
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-2xl card-modern p-6">
        <SectionHeader
          icon={
            <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          }
          title="Notifications"
          description="Choose how and when you want to be notified"
        />
        <div className="space-y-1">
          {[
            {
              key: 'email' as const,
              label: 'Email Notifications',
              desc: 'Receive updates and alerts via email',
              icon: (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              ),
            },
            {
              key: 'push' as const,
              label: 'Push Notifications',
              desc: 'Get real-time browser push alerts',
              icon: (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                </svg>
              ),
            },
            {
              key: 'sms' as const,
              label: 'SMS Notifications',
              desc: 'Receive critical alerts via text message',
              icon: (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              ),
            },
            {
              key: 'tradeAlerts' as const,
              label: 'Trade Alerts',
              desc: 'Notifications for order fills, margin calls, and P&L updates',
              icon: (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              ),
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{item.desc}</div>
                </div>
              </div>
              <ToggleSwitch
                enabled={notifications[item.key]}
                onToggle={() => toggleNotification(item.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-card border border-border rounded-2xl card-modern p-6">
        <SectionHeader
          icon={
            <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          }
          title="Security"
          description="Protect your account with enhanced security measures"
        />
        <div className="space-y-1">
          {/* Change Password */}
          <div className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Change Password</div>
                <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">Update your account password regularly for better security</div>
              </div>
            </div>
            <button className="text-xs font-semibold px-4 py-2 rounded-xl bg-secondary hover:bg-accent text-foreground transition-colors btn-soft">
              Change
            </button>
          </div>

          {/* 2FA */}
          <div className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Two-Factor Authentication</div>
                <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">Add an extra layer of protection with authenticator app</div>
              </div>
            </div>
            <button className="text-xs font-semibold px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors btn-soft">
              Enable
            </button>
          </div>

          {/* Active Sessions */}
          <div className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Active Sessions</div>
                <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">Manage devices where you are currently logged in</div>
              </div>
            </div>
            <button className="text-xs font-semibold px-4 py-2 rounded-xl bg-secondary hover:bg-accent text-foreground transition-colors btn-soft">
              Manage
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-card border border-sell/20 rounded-2xl card-modern p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-sell/10 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 text-sell" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sell">Danger Zone</h3>
            <p className="text-xs text-muted-foreground">Irreversible actions on your account</p>
          </div>
        </div>
        <div className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl">
          <div>
            <div className="text-sm font-medium text-foreground">Close Account</div>
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">Permanently delete your account and all associated data</div>
          </div>
          <button className="text-xs font-semibold px-4 py-2 rounded-xl bg-sell/10 text-sell hover:bg-sell/20 transition-colors btn-soft">
            Close Account
          </button>
        </div>
      </div>
    </div>
  );
}
