#!/usr/bin/env node

const command = process.argv[2] || "init";
const args = process.argv.slice(3);

switch (command) {
  case "init":
    import("./init.js").then((module) => module.runInit());
    break;
  case "collect":
    import("./collect.js").then((module) => module.runCollect(args));
    break;
  case "profile":
    import("./profile.js").then((module) => module.runProfile(args));
    break;
  case "explore":
    import("./explore.js").then((module) => module.runExplore());
    break;
  case "doctor":
    import("./doctor.js").then((module) => module.runDoctor());
    break;
  case "status":
    import("./status.js").then((module) => module.runStatus());
    break;
  case "mcp":
    import("../mcp/server.js");
    break;
  default:
    console.log("Usage: kore-chamber <command>");
    console.log("");
    console.log("Commands:");
    console.log("  init                초기 설치 (볼트 생성 + 프로필 생성)");
    console.log("  collect [options]   대화에서 지식 수집");
    console.log("  profile             MY-PROFILE.md 보기 또는 편집");
    console.log("  explore             볼트 갭 분석 (예정)");
    console.log("  doctor              설치 상태 진단");
    console.log("  status              볼트 통계");
    console.log("  mcp                 MCP 서버 실행 (선택적 수동 사용)");
    console.log("");
    console.log("Collect options:");
    console.log("  --all               미처리 세션 전체 수집");
    console.log("  --dry-run           실제 저장 없이 계획만 표시");
    console.log("  --session <id>      특정 세션 JSONL 지정");
    console.log("  --output <format>   json 또는 markdown (기본: markdown)");
    console.log("");
    console.log("Profile options:");
    console.log("  edit                기본 편집기로 MY-PROFILE.md 열기");
    process.exit(1);
}
