"use client";

import { useEffect, useState } from "react";

/**
 * Host based role split, shared by navigation, login wiring and settings.
 * The business experience is served from a "business" subdomain (e.g.
 * business.example.com, business.localhost); everything else is retail.
 * Matching is on the first host label, not a substring, so a host that merely
 * contains "business" somewhere is not misclassified.
 */

export type SiteRole = "retail" | "business";

export function roleFromHostname(hostname: string): SiteRole {
    const firstLabel = hostname.split(".")[0]?.toLowerCase() ?? "";
    return firstLabel === "business" ? "business" : "retail";
}

export interface UseRoleResult {
    /** Host derived role; defaults to retail until the client mounts. */
    role: SiteRole;
    /** False during SSR and the first client render. */
    ready: boolean;
    isBusinessHost: boolean;
}

export function useRole(): UseRoleResult {
    const [state, setState] = useState<{ role: SiteRole; ready: boolean }>({
        role: "retail",
        ready: false,
    });

    useEffect(() => {
        setState({ role: roleFromHostname(window.location.hostname), ready: true });
    }, []);

    return { role: state.role, ready: state.ready, isBusinessHost: state.role === "business" };
}

/**
 * URL of the same path on the counterpart host, used by the role switch link
 * in the navigation. Adds or removes the leading "business" label and points
 * at each side's home screen.
 */
export function counterpartRoleUrl(currentRole: SiteRole): string {
    if (typeof window === "undefined") {
        return "/";
    }
    const { protocol, hostname, port } = window.location;
    const portSuffix = port ? `:${port}` : "";
    if (currentRole === "business") {
        const labels = hostname.split(".");
        const stripped = labels[0]?.toLowerCase() === "business"
            ? labels.slice(1).join(".")
            : hostname;
        return `${protocol}//${stripped || hostname}${portSuffix}/marketplace`;
    }
    return `${protocol}//business.${hostname}${portSuffix}/dashboard`;
}
