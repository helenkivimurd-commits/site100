import SuccessClient from "./SuccessClient";

export const metadata = {
  title: "Order complete — h_kivimurd Photography",
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  return <SuccessClient sessionId={session_id ?? ""} />;
}
