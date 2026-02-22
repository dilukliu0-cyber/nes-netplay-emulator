function eq(actual: string, expected: string): "PASS" | "FAIL" {
  return actual === expected ? "PASS" : "FAIL";
}

export function registerComputedStyleCheck(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.__checkPink = () => {
    const play = document.querySelector('button[data-action="play"]') as HTMLButtonElement | null;
    const add = document.querySelector('button[data-action="add-game"]') as HTMLButtonElement | null;
    const settings = document.querySelector('button[data-action="settings-open"]') as HTMLButtonElement | null;
    const activeTab = document.querySelector(".bottom-tab.active") as HTMLElement | null;

    const playBg = play ? getComputedStyle(play).backgroundColor : "not-found";
    const addBg = add ? getComputedStyle(add).backgroundColor : "not-found";
    const settingsBg = settings ? getComputedStyle(settings).backgroundColor : "not-found";
    const tabBg = activeTab ? getComputedStyle(activeTab).backgroundColor : "not-found";

    const rows = [
      { check: "play bg normal", expected: "rgb(242, 135, 182)", actual: playBg, result: eq(playBg, "rgb(242, 135, 182)") },
      { check: "add bg normal", expected: "rgb(242, 141, 186)", actual: addBg, result: eq(addBg, "rgb(242, 141, 186)") },
      { check: "settings bg normal", expected: "rgb(235, 170, 201)", actual: settingsBg, result: eq(settingsBg, "rgb(235, 170, 201)") },
      { check: "bottom-tab.active bg", expected: "rgb(245, 156, 195)", actual: tabBg, result: eq(tabBg, "rgb(245, 156, 195)") }
    ];

    console.table(rows);
    const failed = rows.filter((r) => r.result === "FAIL").length;
    console.log(failed === 0 ? "PASS" : "FAIL");
  };
}

