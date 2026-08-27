// Whether the shop is taking visitors.
//
// Closing it is not the same as taking the site down. Twelve download links are
// still live — eight of them bought and paid for — and they run until late
// September. Those must keep working while the browsing and the buying stop,
// because a customer who paid on Tuesday should not find on Wednesday that what
// they bought has gone.
//
// A flag rather than a deleted deployment, so it can be reopened by changing one
// line and restarting, with nothing rebuilt and nothing lost.
export const shopOpen = () => process.env.SHOP_CLOSED !== "1";
