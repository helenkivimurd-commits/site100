import { redirect } from "next/navigation";
import { shopOpen } from "@/lib/shopOpen";
import CheckoutClient from "./CheckoutClient";

// The basket itself runs in the browser, so the check that the shop is open has
// to happen here, before it is handed over.
export default function CheckoutPage() {
  if (!shopOpen()) redirect("/closed");
  return <CheckoutClient />;
}
