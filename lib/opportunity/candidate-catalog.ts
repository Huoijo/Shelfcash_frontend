import type {
  LocalOpportunityContext,
  OpportunityAnalysisLocation,
  OpportunityCandidate,
  OpportunityPoi,
  PoiPoint,
} from "./types";

export const DEFAULT_STORE_LOCATION: OpportunityAnalysisLocation = {
  lat: 10.7725,
  lng: 106.6578,
  label: "ShelfCash Flagship Coffee",
  address: "268 Lý Thường Kiệt, Phường 14, Quận 10, TP. Hồ Chí Minh",
  source: "store",
};

export const CANONICAL_PREVIEW_POIS: OpportunityPoi[] = [
  // 8 Competitors
  { id: "poi-c1", name: "Highlands Coffee", lat: 10.7738, lng: 106.6592, category: "competitor", distanceMeters: 210 },
  { id: "poi-c2", name: "The Coffee House", lat: 10.7712, lng: 106.6558, category: "competitor", distanceMeters: 260 },
  { id: "poi-c3", name: "Phúc Long Coffee & Tea", lat: 10.7745, lng: 106.6565, category: "competitor", distanceMeters: 270 },
  { id: "poi-c4", name: "Katinat Saigon Kafe", lat: 10.7705, lng: 106.6601, category: "competitor", distanceMeters: 340 },
  { id: "poi-c5", name: "Cà phê Ông Bầu", lat: 10.7752, lng: 106.6610, category: "competitor", distanceMeters: 460 },
  { id: "poi-c6", name: "Trà sữa Gong Cha", lat: 10.7698, lng: 106.6535, category: "competitor", distanceMeters: 550 },
  { id: "poi-c7", name: "Cheese Coffee", lat: 10.7761, lng: 106.6542, category: "competitor", distanceMeters: 560 },
  { id: "poi-c8", name: "Cà phê Muối Chú Long", lat: 10.7682, lng: 106.6615, category: "competitor", distanceMeters: 630 },

  // 4 Universities
  { id: "poi-u1", name: "ĐH Bách Khoa TP.HCM", lat: 10.7721, lng: 106.6598, category: "university", distanceMeters: 220 },
  { id: "poi-u2", name: "ĐH Kinh Tế TP.HCM (Cơ sở B)", lat: 10.7749, lng: 106.6635, category: "university", distanceMeters: 680 },
  { id: "poi-u3", name: "ĐH Y Dược TP.HCM", lat: 10.7578, lng: 106.6612, category: "university", distanceMeters: 1700 },
  { id: "poi-u4", name: "ĐH Sư Phạm Kỹ Thuật (Phân hiệu)", lat: 10.7782, lng: 106.6515, category: "university", distanceMeters: 950 },

  // 3 Transit
  { id: "poi-t1", name: "Trạm Metro Tuyến 2 (Bách Khoa)", lat: 10.7728, lng: 106.6570, category: "transit", distanceMeters: 95 },
  { id: "poi-t2", name: "Trạm xe buýt Lý Thường Kiệt", lat: 10.7718, lng: 106.6582, category: "transit", distanceMeters: 110 },
  { id: "poi-t3", name: "Bến xe buýt / Điểm trung chuyển Chợ Lớn", lat: 10.7535, lng: 106.6520, category: "transit", distanceMeters: 2200 },

  // 5 Supporting Retail
  { id: "poi-r1", name: "Siêu thị Co.opmart Lý Thường Kiệt", lat: 10.7709, lng: 106.6572, category: "supporting_retail", distanceMeters: 190 },
  { id: "poi-r2", name: "Vạn Hạnh Mall", lat: 10.7695, lng: 106.6672, category: "supporting_retail", distanceMeters: 1100 },
  { id: "poi-r3", name: "Cửa hàng tiện lợi GS25", lat: 10.7732, lng: 106.6562, category: "supporting_retail", distanceMeters: 190 },
  { id: "poi-r4", name: "Circle K Lý Thường Kiệt", lat: 10.7715, lng: 106.6591, category: "supporting_retail", distanceMeters: 180 },
  { id: "poi-r5", name: "Nhà sách Phương Nam", lat: 10.7741, lng: 106.6618, category: "supporting_retail", distanceMeters: 480 },
];

/**
 * Generates deterministic POIs around any chosen analysis center and radius.
 */
export function generatePreviewPoisForLocation(
  center: OpportunityAnalysisLocation,
  radiusKm: number
): OpportunityPoi[] {
  const scale = Math.min(1.5, Math.max(0.6, radiusKm / 3));

  return CANONICAL_PREVIEW_POIS.map((poi) => {
    // Relative displacement from default center
    const relLat = (poi.lat - DEFAULT_STORE_LOCATION.lat) * scale;
    const relLng = (poi.lng - DEFAULT_STORE_LOCATION.lng) * scale;

    const lat = center.lat + relLat;
    const lng = center.lng + relLng;
    const distanceMeters = Math.round((poi.distanceMeters ?? 300) * scale);

    return {
      ...poi,
      id: `${poi.id}-${center.source}-${radiusKm}`,
      lat,
      lng,
      distanceMeters,
    };
  });
}

export const PREVIEW_POI_POINTS: PoiPoint[] = [
  { id: "poi-c1", label: "Chuỗi cà phê A", type: "competition", angleDeg: 28, distanceNormalized: 0.38 },
  { id: "poi-c2", label: "Quán trà sữa X", type: "competition", angleDeg: 68, distanceNormalized: 0.65 },
  { id: "poi-c3", label: "Cà phê vỉa hè B", type: "competition", angleDeg: 115, distanceNormalized: 0.44 },
  { id: "poi-c4", label: "Chuỗi đồ uống C", type: "competition", angleDeg: 160, distanceNormalized: 0.72 },
  { id: "poi-c5", label: "Quán trà trái cây D", type: "competition", angleDeg: 205, distanceNormalized: 0.35 },
  { id: "poi-c6", label: "Quán cà phê Specialty", type: "competition", angleDeg: 250, distanceNormalized: 0.58 },
  { id: "poi-c7", label: "Tiệm trà sữa Y", type: "competition", angleDeg: 295, distanceNormalized: 0.78 },
  { id: "poi-c8", label: "Chuỗi đồ uống E", type: "competition", angleDeg: 335, distanceNormalized: 0.48 },
];

export const PREVIEW_LOCAL_CONTEXT: LocalOpportunityContext = {
  radiusKm: 3,
  totalPois: 20,
  scannedPois: 20,
  metrics: [
    { key: "competitor", label: "Cửa hàng / Đối thủ", count: 8 },
    { key: "university", label: "Trường / Đại học", count: 4 },
    { key: "transit", label: "Transit", count: 3 },
    { key: "supporting_retail", label: "Retail bổ trợ", count: 5 },
  ],
  signals: [
    { key: "students", label: "Sinh viên cao", badgeType: "info" },
    { key: "to_go", label: "Mang đi mạnh", badgeType: "success" },
    { key: "rainy_season", label: "Mùa mưa", badgeType: "warning" },
  ],
  poiPoints: PREVIEW_POI_POINTS,
  pois: CANONICAL_PREVIEW_POIS,
};

export const PREVIEW_CANDIDATE_CATALOG: OpportunityCandidate[] = [
  {
    id: "cand-tra-lai",
    name: "Trà Lài",
    category: "Trà & Giải khát",
    domain: "same_domain",
    opportunityScore: 0.82,
    rank: 1,
    criteria: {
      areaFit: "Cao",
      ingredientLeverage: "Rất cao",
      menuDifferentiation: "Tốt",
      complexity: "Thấp",
    },
    priceRange: {
      min: 32000,
      max: 38000,
    },
    trialCost: 480000,
    keyHighlights: [
      "Dùng lại nguyên liệu hiện có",
      "Phù hợp nhóm khách quanh khu vực",
    ],
    whyPath: [
      "Đại học tập trung cao",
      "Nhóm khách sinh viên",
      "Ưu tiên nhanh / mang đi",
      "Trà Lài",
      "Tận dụng nguyên liệu hiện có",
      "Chi phí thử thấp",
    ],
    reusableIngredients: ["Trà xanh hoa lài", "Đường mía", "Đá viên"],
    newIngredients: ["Hoa lài sấy khô trang trí"],
    preparationTimeMinutes: 2,
    constraints: ["Hương trà nhạy cảm với nhiệt độ ủ", "Bảo quản cốt trà trong 4 giờ"],
  },
  {
    id: "cand-cf-muoi",
    name: "Cà Phê Muối Biển",
    category: "Cà phê",
    domain: "same_domain",
    opportunityScore: 0.76,
    rank: 2,
    criteria: {
      areaFit: "Rất cao",
      ingredientLeverage: "Cao",
      menuDifferentiation: "Rất cao",
      complexity: "Thấp",
    },
    priceRange: {
      min: 35000,
      max: 42000,
    },
    trialCost: 560000,
    keyHighlights: [
      "Món xu hướng có tỷ lệ gọi lặp lại cao",
      "Tận dụng cốt cà phê Robusta pha sẵn",
    ],
    whyPath: [
      "Mật độ văn phòng & transit cao",
      "Nhu cầu thử vị mới buổi sáng",
      "Cà Phê Muối Biển",
      "Tận dụng hạt Robusta & sữa đặc sẵn có",
      "Khác biệt với đối thủ lân cận",
    ],
    reusableIngredients: ["Cà phê Robusta", "Sữa đặc", "Sữa tươi"],
    newIngredients: ["Bột kem muối biển", "Kem béo thực vật"],
    preparationTimeMinutes: 3,
    constraints: ["Kem muối cần đánh bọt lạnh", "Thời gian tách lớp bọt khoảng 20 phút"],
  },
  {
    id: "cand-coldbrew-camsa",
    name: "Cold Brew Cam Sả",
    category: "Cold Brew",
    domain: "same_domain",
    opportunityScore: 0.71,
    rank: 3,
    criteria: {
      areaFit: "Cao",
      ingredientLeverage: "Trung bình",
      menuDifferentiation: "Tốt",
      complexity: "Trung bình",
    },
    priceRange: {
      min: 45000,
      max: 52000,
    },
    trialCost: 580000,
    keyHighlights: [
      "Thời gian bảo quản lạnh tốt trong ngày",
      "Biên lợi nhuận gộp cao (>65%)",
    ],
    whyPath: [
      "Khách hàng trẻ thích đồ uống giải nhiệt",
      "Xu hướng thức uống ủ lạnh mang đi",
      "Cold Brew Cam Sả",
      "Thời gian bảo quản lạnh tốt trong ngày",
      "Biên lợi nhuận cao",
    ],
    reusableIngredients: ["Hạt Arabica Cầu Đất", "Đường mía"],
    newIngredients: ["Cam vàng tươi", "Syrup sả tự nhiên"],
    preparationTimeMinutes: 2,
    constraints: ["Cần ủ lạnh trước 14–16 giờ", "Hạn dùng mẻ ủ tối đa 48 giờ"],
  },
  {
    id: "cand-tra-olong-nuong",
    name: "Trà Sữa Ô Long Nướng",
    category: "Trà sữa",
    domain: "same_domain",
    opportunityScore: 0.68,
    rank: 4,
    criteria: {
      areaFit: "Cao",
      ingredientLeverage: "Cao",
      menuDifferentiation: "Khá",
      complexity: "Trung bình",
    },
    priceRange: {
      min: 38000,
      max: 46000,
    },
    trialCost: 620000,
    keyHighlights: [
      "Tăng lượng đơn khung giờ 15h–18h",
      "Dùng chung dụng cụ pha chế hiện tại",
    ],
    whyPath: [
      "Lưu lượng sinh viên buổi chiều tối",
      "Nhu cầu đồ uống ngọt giải tỏa năng lượng",
      "Trà Sữa Ô Long Nướng",
      "Dùng chung syrup và trân châu sẵn có",
    ],
    reusableIngredients: ["Sữa tươi", "Đường đen", "Trân châu hoàng kim"],
    newIngredients: ["Trà Ô Long sấy than"],
    preparationTimeMinutes: 4,
    constraints: ["Cần kiểm soát độ đậm vị trà ủ"],
  },
  {
    id: "cand-croissant-almond",
    name: "Bánh Croissant Hạnh Nhân",
    category: "Bánh & Ăn kèm",
    domain: "cross_domain",
    opportunityScore: 0.63,
    rank: 5,
    criteria: {
      areaFit: "Trung bình",
      ingredientLeverage: "Thấp",
      menuDifferentiation: "Rất cao",
      complexity: "Trung bình",
    },
    priceRange: {
      min: 28000,
      max: 35000,
    },
    trialCost: 750000,
    keyHighlights: [
      "Tăng giá trị trung bình trên đơn hàng (AOV)",
      "Mở rộng danh mục ăn nhẹ buổi sáng",
    ],
    whyPath: [
      "Nhu cầu combo ăn sáng kèm cà phê",
      "Tăng giá trị trung bình trên mỗi đơn",
      "Bánh Croissant Hạnh Nhân",
      "Liên kết đối tác làm bánh giao sáng",
    ],
    reusableIngredients: [],
    newIngredients: ["Bánh Croissant nướng sẵn", "Hạnh nhân lát", "Đường bột"],
    preparationTimeMinutes: 3,
    constraints: ["Cần tủ kính trưng bày bánh", "Hạn sử dụng trong ngày"],
  },
];
