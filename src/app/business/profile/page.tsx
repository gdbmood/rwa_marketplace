import BusinessAuthGate from "@/components/business/auth-gate";
import BusinessProfileView from "@/components/business/profile-view";
import { BusinessPageShell, NotBusinessNotice } from "@/components/business/page-shell";
import { getBusinessGate, toBusinessProfileDto } from "@/components/business/server";

export const dynamic = "force-dynamic";

/**
 * Business profile completion and account details. Reachable for unverified
 * businesses too, so the profile can be completed before or after KYB.
 */
export default async function BusinessProfilePage() {
    const gate = await getBusinessGate();

    if (gate.status === "unauthenticated") {
        return (
            <BusinessPageShell>
                <BusinessAuthGate message="Connect your business wallet to manage your profile" />
            </BusinessPageShell>
        );
    }
    if (gate.status === "not_business") {
        return (
            <BusinessPageShell>
                <NotBusinessNotice />
            </BusinessPageShell>
        );
    }

    return (
        <BusinessPageShell>
            <BusinessProfileView profile={toBusinessProfileDto(gate.user)} />
        </BusinessPageShell>
    );
}
