import BusinessAuthGate from "@/components/business/auth-gate";
import BusinessSettingsView from "@/components/business/settings-view";
import { BusinessPageShell, NotBusinessNotice } from "@/components/business/page-shell";
import { getBusinessGate, toBusinessSettingsDto } from "@/components/business/server";

export const dynamic = "force-dynamic";

/** Business settings on the updateSettings action (no browser writes). */
export default async function BusinessSettingsPage() {
    const gate = await getBusinessGate();

    if (gate.status === "unauthenticated") {
        return (
            <BusinessPageShell>
                <BusinessAuthGate message="Connect your business wallet to change your settings" />
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
            <BusinessSettingsView settings={toBusinessSettingsDto(gate.user)} />
        </BusinessPageShell>
    );
}
