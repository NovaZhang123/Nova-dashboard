// ╔══════════════════════════════════════════╗
// ║                 INIT                    ║
// ╚══════════════════════════════════════════╝

reconcileLeaves();

// 自动补建「已到上课日但还没建记录」的视频记录（幂等，一天一次）
autoCreateVideoRecordsOnce();

applyHealthTabVisibility();

renderHeader();
renderListening();
