import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button, Card, ErrorNote, Field, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useDemo } from "@/lib/demo";
import { formatDate } from "@/lib/format";
import { useHousehold } from "@/lib/household";
import {
  useAcceptInvite,
  useCreateInvite,
  useHouseholdInvites,
  useMembers,
  useMyInvites,
  useRevokeInvite,
} from "@/lib/queries";
import { inviteFormSchema, type InviteFormValues } from "@/lib/schemas";
import { useTheme, type ThemePreference } from "@/lib/theme";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { enabled: demo, exit: exitDemo } = useDemo();
  const { memberships, active, setActiveId } = useHousehold();

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-12"
    >
      <MyInvitesCard />

      <SectionTitle>Appearance</SectionTitle>
      <AppearanceCard />

      <SectionTitle>Household</SectionTitle>
      <Card>
        {memberships.length > 1 ? (
          <View className="mb-4">
            <Text className="mb-2 text-sm text-ink-dim">
              You belong to {memberships.length} households. Active:
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {memberships.map((m) => {
                const selected = m.household.id === active?.household.id;
                return (
                  <Pressable
                    key={m.household.id}
                    accessibilityRole="button"
                    className={`rounded-full border px-3 py-2 active:opacity-70 ${
                      selected ? "border-accent bg-accent" : "border-edge bg-card"
                    }`}
                    onPress={() => setActiveId(m.household.id)}
                  >
                    <Text
                      className={
                        selected
                          ? "text-sm font-semibold text-on-accent"
                          : "text-sm text-ink"
                      }
                    >
                      {m.household.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {active ? <HouseholdDetails /> : null}
      </Card>

      <SectionTitle>Account</SectionTitle>
      {demo ? (
        <Card>
          <Text className="mb-1 text-sm text-ink-dim">Demo mode</Text>
          <Text className="mb-4 text-base font-medium text-ink">
            Example data — changes vanish when you exit
          </Text>
          <Button
            title="Exit demo"
            variant="secondary"
            onPress={() => exitDemo()}
          />
        </Card>
      ) : (
        <Card>
          <Text className="mb-1 text-sm text-ink-dim">Signed in as</Text>
          <Text className="mb-4 text-base font-medium text-ink">
            {session?.user.email ?? "—"}
          </Text>
          <Button
            title="Sign out"
            variant="secondary"
            onPress={() => signOut()}
          />
        </Card>
      )}

      <Text className="mt-8 text-center text-xs text-ink-dim">
        Hearth — home asset & maintenance tracker
      </Text>
    </ScrollView>
  );
}

function AppearanceCard() {
  const { preference, setPreference } = useTheme();
  const options: { value: ThemePreference; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <Card>
      <View className="flex-row gap-2">
        {options.map((opt) => {
          const selected = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              className={`flex-1 items-center rounded-xl border px-3 py-3 active:opacity-70 ${
                selected ? "border-accent bg-accent" : "border-edge bg-card"
              }`}
              onPress={() => setPreference(opt.value)}
            >
              <Text
                className={
                  selected
                    ? "text-sm font-semibold text-on-accent"
                    : "text-sm text-ink"
                }
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function HouseholdDetails() {
  const { session } = useAuth();
  const { enabled: demo } = useDemo();
  const { active } = useHousehold();
  const householdId = active!.household.id;
  const isOwner = active!.role === "owner";

  const { data: members = [] } = useMembers(householdId);
  const { data: invites = [] } = useHouseholdInvites(
    isOwner ? householdId : undefined,
  );
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: "" },
  });

  const sendInvite = handleSubmit(async (values) => {
    await createInvite.mutateAsync({ householdId, email: values.email });
    reset();
  });

  return (
    <View>
      <Text className="text-lg font-semibold text-ink">
        {active!.household.name}
      </Text>
      <Text className="mb-3 text-sm text-ink-dim">
        {members.length} member{members.length === 1 ? "" : "s"} · you are{" "}
        {active!.role}
      </Text>

      {members.map((m) => (
        <View
          key={m.user_id}
          className="flex-row items-center justify-between border-t border-edge py-2.5"
        >
          <Text className="text-sm text-ink">
            {demo || m.user_id === session?.user.id
              ? "You"
              : `Member ${m.user_id.slice(0, 8)}`}
          </Text>
          <Text className="text-xs uppercase text-ink-dim">{m.role}</Text>
        </View>
      ))}

      {isOwner ? (
        <View className="mt-4">
          <Text className="mb-2 text-sm font-medium text-ink">
            Invite someone by email
          </Text>
          <Text className="mb-3 text-xs text-ink-dim">
            No email is sent — tell them to sign in with Pocket-ID and the
            invite will be waiting on this screen.
          </Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Email"
                placeholder="spouse@example.com"
                autoCapitalize="none"
                inputMode="email"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />
          {createInvite.error ? (
            <ErrorNote message={createInvite.error.message} />
          ) : null}
          <Button
            title="Create invite"
            variant="secondary"
            loading={createInvite.isPending}
            onPress={() => sendInvite()}
          />

          {invites.length > 0 ? (
            <View className="mt-4">
              <Text className="mb-1 text-sm font-medium text-ink">
                Pending invites
              </Text>
              {invites.map((inv) => (
                <View
                  key={inv.id}
                  className="flex-row items-center justify-between border-t border-edge py-2.5"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-sm text-ink" numberOfLines={1}>
                      {inv.email}
                    </Text>
                    <Text className="text-xs text-ink-dim">
                      expires {formatDate(inv.expires_at.slice(0, 10))}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    className="rounded-lg border border-edge px-3 py-1.5 active:opacity-70"
                    onPress={() =>
                      revokeInvite.mutate({
                        id: inv.id,
                        household_id: inv.household_id,
                      })
                    }
                  >
                    <Text className="text-xs text-danger">Revoke</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Pending invites addressed to me, surfaced on login (§2.4). */
function MyInvitesCard() {
  const { session } = useAuth();
  const { data: invites = [] } = useMyInvites(session?.user.email ?? undefined);
  const accept = useAcceptInvite();

  if (invites.length === 0) return null;

  return (
    <View className="mb-2">
      <SectionTitle>Invitations for you</SectionTitle>
      <Card>
        {accept.error ? <ErrorNote message={accept.error.message} /> : null}
        {invites.map((inv) => (
          <View
            key={inv.id}
            className="flex-row items-center justify-between py-2"
          >
            <View className="flex-1 pr-3">
              <Text className="text-sm font-medium text-ink">
                {inv.household?.name ?? "A household"}
              </Text>
              <Text className="text-xs text-ink-dim">
                invited {formatDate(inv.created_at.slice(0, 10))}
              </Text>
            </View>
            <Button
              title="Join"
              loading={accept.isPending}
              onPress={() => accept.mutate(inv.id)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
