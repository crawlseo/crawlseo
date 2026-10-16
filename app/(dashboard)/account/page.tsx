import { redirect } from "next/navigation";

/** The account page moved to /settings; old links and bookmarks land there. */
export default function AccountPage(): never {
  redirect("/settings");
}
