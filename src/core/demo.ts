// Demo dataset, generated relative to "today". Every record carries demo: true so the UI can
// label it and remove it in one step. Links point to public documentation or example.com.
import { addDays, weekday } from './dates.js';
import type { Bundle, Day, DayMark, LogEntry, Sprint, Track } from './types.js';
import { DEFAULT_SETTINGS } from './types.js';

export function demoBundle(today: Day): Omit<Bundle, 'exportedAt'> {
  const d = (n: number) => addDays(today, n);
  const ts = (n: number, h = 21) => `${d(n)}T${String(h).padStart(2, '0')}:00:00.000Z`;

  const devops: Track = {
    id: 'demo-devops', name: 'DevOps: GitOps với Argo CD', color: '#2f5bea', demo: true,
    why: 'Muốn tự dựng được luồng GitOps hoàn chỉnh để áp dụng cho dự án ở công ty.',
    tinyAction: 'Mở terminal, chạy một lệnh kubectl hoặc đọc một trang docs (10 phút)',
    plan: 'Sau khi ăn tối xong, tôi mở laptop và làm bước nhỏ ngay tại bàn.',
    weeklyTarget: 5, restDays: [0], nextStep: '', pauses: [], archived: false, createdAt: d(-27),
  };
  const video: Track = {
    id: 'demo-video', name: 'Dựng video ngắn', color: '#d9480f', demo: true,
    why: 'Tự dựng được video du lịch 60 giây mà không cần nhờ ai.',
    tinyAction: 'Mở project và cắt một đoạn 10 giây',
    plan: 'Tối thứ Bảy, sau khi dọn nhà, tôi ngồi dựng 30 phút.',
    weeklyTarget: 3, restDays: [], archived: false, createdAt: d(-46),
    nextStep: 'Mở project, cắt lại 10 giây đầu của video du lịch',
    pauses: [{ from: d(-18), note: 'Dồn sức cho DevOps lab trong tháng này' }],
  };
  const reading: Track = {
    id: 'demo-reading', name: 'Đọc: Designing Data-Intensive Applications', color: '#0e9f8f', demo: true,
    why: 'Hiểu nền tảng hệ thống dữ liệu để thiết kế tốt hơn.',
    tinyAction: 'Đọc hai trang và ghi một ý',
    plan: 'Khi lên giường, tôi đọc trước khi cầm điện thoại.',
    weeklyTarget: 3, restDays: [], nextStep: '', pauses: [], archived: false, createdAt: d(-20),
  };

  const sprints: Sprint[] = [
    {
      id: 'demo-s0', trackId: devops.id, title: 'Ôn Kubernetes cơ bản', deliverable: 'Ghi chú một trang về Pod, Deployment, Service kèm lệnh mẫu',
      start: d(-27), end: d(-14), status: 'done', closedOn: d(-13), demo: true,
      reflection: 'Xong đúng hạn. Bước nhỏ 10 phút giúp tôi vẫn học đều vào những ngày đi làm về muộn.',
      milestones: [
        { id: 'demo-m01', text: 'Chạy được Pod và Deployment trên kind', done: true, doneOn: d(-24) },
        { id: 'demo-m02', text: 'Expose bằng Service và Ingress', done: true, doneOn: d(-19) },
        { id: 'demo-m03', text: 'Viết ghi chú một trang', done: true, doneOn: d(-14) },
      ],
    },
    {
      id: 'demo-s1', trackId: devops.id, title: 'GitOps với Argo CD', deliverable: 'Repo có app mẫu được Argo CD tự sync cho hai môi trường dev và prod',
      start: d(-11), end: d(9), status: 'active', demo: true,
      milestones: [
        { id: 'demo-m11', text: 'Dựng cluster k3d một node', done: true, doneOn: d(-9) },
        { id: 'demo-m12', text: 'Cài Argo CD và vào được UI', done: true, doneOn: d(-6) },
        { id: 'demo-m13', text: 'Sync app mẫu từ repo Git', done: true, doneOn: d(-2) },
        { id: 'demo-m14', text: 'Thêm Kustomize overlay dev/prod', done: false },
        { id: 'demo-m15', text: 'Viết README ghi lại cách làm', done: false },
      ],
    },
    {
      id: 'demo-s2', trackId: video.id, title: 'Video du lịch 60 giây', deliverable: 'Một video 60 giây có nhạc, chuyển cảnh và chỉnh màu cơ bản',
      start: d(-30), end: d(-3), status: 'active', demo: true,
      milestones: [
        { id: 'demo-m21', text: 'Chọn 20 clip và sắp timeline thô', done: true, doneOn: d(-26) },
        { id: 'demo-m22', text: 'Cắt khớp theo nhạc', done: true, doneOn: d(-21) },
        { id: 'demo-m23', text: 'Chỉnh màu cơ bản', done: false },
        { id: 'demo-m24', text: 'Thêm chữ và âm thanh', done: false },
        { id: 'demo-m25', text: 'Xuất bản 1080p', done: false },
      ],
    },
    {
      id: 'demo-s3', trackId: reading.id, title: 'Phần I: Foundations of Data Systems', deliverable: 'Ghi chú tóm tắt chương 1-4, mỗi chương một trang',
      start: d(-20), end: d(7), status: 'active', demo: true,
      milestones: [
        { id: 'demo-m31', text: 'Chương 1: Reliable, Scalable, Maintainable', done: true, doneOn: d(-14) },
        { id: 'demo-m32', text: 'Chương 2: Data Models', done: true, doneOn: d(-5) },
        { id: 'demo-m33', text: 'Chương 3: Storage and Retrieval', done: false },
        { id: 'demo-m34', text: 'Chương 4: Encoding and Evolution', done: false },
      ],
    },
  ];

  const logs: LogEntry[] = [];
  let n = 0;
  const log = (t: Track, day: number, kind: 'tiny' | 'full', minutes: number, note: string, extra: Partial<LogEntry> = {}) =>
    logs.push({ id: `demo-l${++n}`, trackId: t.id, day: d(day), kind, minutes, note, blocker: '', evidence: [], createdAt: ts(day), demo: true, ...extra });

  // DevOps: steady, mostly full sessions, tiny steps on busy days, one miss yesterday.
  const devPattern: Record<number, [kind: 'tiny' | 'full', min: number, note: string]> = {
    [-27]: ['full', 50, 'Cài kind, chạy cluster đầu tiên'], [-26]: ['full', 40, 'Pod, ReplicaSet, Deployment'], [-25]: ['tiny', 10, 'Đọc docs về labels'],
    [-24]: ['full', 45, 'Rolling update Deployment'], [-22]: ['full', 35, 'Service ClusterIP và NodePort'], [-20]: ['tiny', 10, 'Đọc về Ingress controller'],
    [-19]: ['full', 60, 'Cài ingress-nginx, expose app'], [-18]: ['tiny', 15, 'Ôn lệnh kubectl'], [-17]: ['full', 40, 'ConfigMap và Secret'],
    [-15]: ['full', 30, 'Viết nháp ghi chú'], [-14]: ['full', 45, 'Hoàn thiện ghi chú một trang'], [-12]: ['tiny', 10, 'Đọc getting started Argo CD'],
    [-11]: ['full', 40, 'Lên kế hoạch đợt GitOps'], [-10]: ['tiny', 15, 'Cài k3d'], [-9]: ['full', 50, 'Dựng cluster k3d'],
    [-8]: ['full', 30, 'Đọc kiến trúc Argo CD'], [-6]: ['full', 55, 'Cài Argo CD, đổi mật khẩu admin'], [-5]: ['tiny', 10, 'Xem Application CRD'],
    [-4]: ['full', 40, 'Tạo repo gitops-demo'], [-3]: ['tiny', 10, 'Đọc về sync policy'], [-2]: ['full', 60, 'App mẫu đã sync thành công'],
  };
  for (const [k, [kind, min, note]] of Object.entries(devPattern)) {
    const day = Number(k);
    if (weekday(d(day)) === 0 && kind === 'tiny') continue; // planned rest day stays free
    log(devops, day, kind, min, note);
  }
  const ld = (day: number) => logs.find((l) => l.trackId === devops.id && l.day === d(day));
  const add = (day: number, extra: Partial<LogEntry>) => { const l = ld(day); if (l) Object.assign(l, extra); };
  add(-9, { milestoneId: 'demo-m11', evidence: [{ kind: 'link', value: 'https://k3d.io/stable/usage/commands/k3d_cluster_create/', label: 'Lệnh đã dùng' }] });
  add(-6, { milestoneId: 'demo-m12', blocker: 'Port-forward bị ngắt liên tục khi để máy ngủ', evidence: [{ kind: 'link', value: 'https://argo-cd.readthedocs.io/en/stable/getting_started/', label: 'Getting started' }] });
  add(-4, { evidence: [{ kind: 'link', value: 'https://example.com/gitops-demo/commit/1a2b3c4', label: 'Commit khởi tạo repo (ví dụ)' }] });
  add(-2, { milestoneId: 'demo-m13', evidence: [{ kind: 'note', value: 'Argo CD báo Synced/Healthy cho app guestbook sau khi sửa path trong Application.' }, { kind: 'link', value: 'https://example.com/gitops-demo/commit/5d6e7f8', label: 'Thêm Application manifest (ví dụ)' }] });
  add(-14, { milestoneId: 'demo-m03', evidence: [{ kind: 'note', value: 'Ghi chú một trang: Pod, Deployment, Service, Ingress kèm 12 lệnh hay dùng.' }] });

  // Video: active then paused 18 days ago.
  const vid: [number, 'tiny' | 'full', number, string][] = [
    [-46, 'full', 60, 'Làm quen giao diện, import clip'], [-44, 'full', 45, 'Học phím tắt cắt'], [-41, 'tiny', 10, 'Xem một video hướng dẫn'],
    [-39, 'full', 50, 'Dựng thử 15 giây'], [-36, 'full', 40, 'Chọn nhạc'], [-33, 'tiny', 10, 'Lọc clip'], [-30, 'full', 60, 'Lên kế hoạch video 60 giây'],
    [-26, 'full', 70, 'Sắp timeline thô 20 clip'], [-24, 'tiny', 15, 'Đánh dấu beat nhạc'], [-21, 'full', 80, 'Cắt khớp theo nhạc'], [-19, 'tiny', 10, 'Xem lại bản cắt'],
  ];
  for (const [day, kind, min, note] of vid) log(video, day, kind, min, note);
  const vl = logs.find((l) => l.trackId === video.id && l.day === d(-21));
  if (vl) Object.assign(vl, { milestoneId: 'demo-m22', blocker: 'Chưa biết chỉnh màu cho đều giữa các clip', evidence: [{ kind: 'note', value: 'Bản cắt 58 giây, chuyển cảnh khớp beat ở 80% đoạn.' }] });

  // Reading: about three days a week, done today.
  for (const [day, kind, min, note] of [
    [-20, 'full', 30, 'Chương 1 phần đầu'], [-18, 'tiny', 10, 'Hai trang về reliability'], [-16, 'full', 25, 'Scalability: load parameters'],
    [-14, 'full', 30, 'Xong chương 1, viết ghi chú'], [-11, 'full', 30, 'Chương 2: relational vs document'], [-9, 'tiny', 10, 'Hai trang về graph model'],
    [-7, 'full', 35, 'Query languages'], [-5, 'full', 30, 'Xong chương 2'], [-3, 'tiny', 10, 'Bắt đầu chương 3: log-structured storage'], [0, 'full', 30, 'SSTables và LSM-tree'],
  ] as [number, 'tiny' | 'full', number, string][]) log(reading, day, kind, min, note);
  const rl = logs.find((l) => l.trackId === reading.id && l.day === d(-5));
  if (rl) Object.assign(rl, { milestoneId: 'demo-m32', evidence: [{ kind: 'note', value: 'Tóm tắt chương 2: khi nào chọn document model, khi nào relational.' }] });

  const marks: DayMark[] = [
    { id: 'demo-k1', trackId: devops.id, day: d(-16), kind: 'busy', note: 'Trực sự cố đến khuya', demo: true },
  ];
  return { app: 'nhip', version: 1, tracks: [devops, video, reading], sprints, logs, marks, reviews: [], settings: { ...DEFAULT_SETTINGS } };
}

