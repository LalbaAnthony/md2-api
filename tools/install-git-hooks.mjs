import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const isGitWorkingTree = () => existsSync(".git");

const main = () => {
  if (!isGitWorkingTree()) {
    process.stdout.write("No git working tree here, skipping hook installation.\n");
    return;
  }
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
    process.stdout.write("Git hooks installed from .githooks.\n");
  } catch {
    process.stdout.write("Git is unavailable, skipping hook installation.\n");
  }
};

main();
