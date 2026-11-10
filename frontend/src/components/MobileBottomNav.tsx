"use client";

import React from "react";

export type MobileTab = "home" | "opportunities" | "papertrading" | "research" | "profile";

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  holdingsCount?: number;
  userName?: string;
}

export default function MobileBottomNav({
  activeTab,
  onChangeTab,
  holdingsCount = 0,
  userName = "User"
}: MobileBottomNavProps) {
  const navItems = [
    {
      id: "home" as MobileTab,
      label: "Home",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    },
    {
      id: "opportunities" as MobileTab,
      label: "Explore",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    },
    {
      id: "papertrading" as MobileTab,
      label: "Paper Trade",
      badge: holdingsCount > 0 ? holdingsCount : undefined,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    },
    {
      id: "research" as MobileTab,
      label: "AI Research",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    },
    {
      id: "profile" as MobileTab,
      label: userName.length > 8 ? `${userName.slice(0, 7)}…` : userName,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    }
  ];

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Mobile Navigation"
    >
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChangeTab(item.id)}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              background: "transparent",
              border: "none",
              color: isActive ? "var(--accent-ml)" : "var(--color-text-muted)",
              cursor: "pointer",
              padding: "6px 2px",
              minHeight: "48px",
              position: "relative",
              transition: "all 0.15s ease",
              outline: "none"
            }}
          >
            {/* Active Indicator Top Bar */}
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  width: "28px",
                  height: "3px",
                  borderRadius: "0 0 3px 3px",
                  background: "var(--accent-ml)"
                }}
              />
            )}

            {/* Icon with optional badge */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {item.icon}
              {item.badge !== undefined && (
                <span
                  style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-10px",
                    background: "var(--color-buy)",
                    color: "#ffffff",
                    fontSize: "9px",
                    fontWeight: "800",
                    padding: "1px 5px",
                    borderRadius: "10px",
                    minWidth: "16px",
                    height: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(5, 150, 105, 0.4)"
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: "clamp(9px, 2.5vw, 10.5px)",
                fontWeight: isActive ? "800" : "600",
                letterSpacing: "-0.2px",
                lineHeight: 1.1,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

