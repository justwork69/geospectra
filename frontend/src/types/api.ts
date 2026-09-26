export type ChangeStatus = 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'SUPPRESSED';

export type ChangeType =
  | 'construction'
  | 'vegetation_clearance'
  | 'water_extent_change'
  | 'road_development'
  | 'no_clear_category'
  | string;

export interface Stats {
  aoi_count: number;
  scene_count: number;
  tile_count: number;
  vector_count: number;
  candidates_scored: number;
  candidates_promoted: number;
  candidates_confirmed: number;
  candidates_suppressed: number;
  discovery_clusters: number;
  accelerating_tiles: number;
  sar_supported_candidates: number;
  sar_status: string;
  learner_status: string;
  learner_examples: number;
  llm_available: boolean;
  llm_model_pulled: boolean;
  llm_model: string;
  processing_version: string | null;
  last_run: string | null;
}

export interface AOI {
  aoi_id: string;
  name: string;
  bbox: [number, number, number, number];
  start_date: string | null;
  end_date: string | null;
  scene_count: number;
  tile_count: number;
  mosaic_thumbnail_url: string | null;
  last_activity: string | null;
}

export interface AOITileSummary {
  tile_id: string;
  aoi_id: string;
  aoi_name: string;
  first_observation: string | null;
  latest_observation: string | null;
  observation_count: number;
  thumbnail_url: string | null;
  latest_velocity: number | null;
  acceleration: number | null;
  trend: string | null;
  bbox?: [number, number, number, number] | null;
}

export interface AOITilesResponse {
  aoi_id: string;
  aoi_name: string;
  tile_count: number;
  tiles: AOITileSummary[];
}

export interface TimelineEntry {
  date: string;
  scene_id: string;
  sensor: string | null;
  cloud_fraction: number | null;
  tile_count: number;
  acquisition_date_source: string | null;
  thumbnail_url: string | null;
}

export interface MosaicTile {
  tile_id: string;
  vector_id: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  cluster_id: number | null;
  has_change_candidate: boolean;
}

export interface Mosaic {
  aoi_id: string;
  date: string;
  image_url: string;
  width: number;
  height: number;
  tiles: MosaicTile[];
}

export interface TileDetail {
  tile_id: string;
  vector_id: number | null;
  aoi_id: string;
  scene_id: string;
  date: string;
  acquisition_date_source: string | null;
  sensor: string | null;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
  ndvi_mean: number | null;
  ndwi_mean: number | null;
  cloud_fraction: number | null;
  valid_pixel_fraction: number | null;
  cluster_id: number | null;
  processing_version: string | null;
  thumbnail_url: string | null;
}

export interface SearchResult {
  tile_id: string;
  vector_id: number | null;
  reference_vector_id?: number | null;
  aoi_id: string;
  aoi_name: string | null;
  date: string;
  similarity: number;
  lat: number;
  lon: number;
  thumbnail_url: string | null;
  reference_thumbnail_url: string | null;
  reference_date: string | null;
  analysis_available: boolean;
  change_candidate_id: string | null;
}

export interface CompareResult {
  difference_image_url: string | null;
}

export interface ChangeCandidate {
  candidate_id: string;
  vector_id: number | null;
  tile_id: string;
  aoi_id: string;
  aoi_name: string | null;
  before_date: string;
  after_date: string;
  embedding_drift: number | null;
  spectral_delta: number | null;
  combined_score: number | null;
  change_type: ChangeType | null;
  confidence: number | null;
  status: ChangeStatus;
  suppressed: boolean;
  suppression_reason: string | null;
  earliest_supported_date: string | null;
  before_thumbnail_url: string | null;
  after_thumbnail_url: string | null;
  before_source_available: boolean;
  after_source_available: boolean;
  source_unavailable_reason: string | null;
  land_cover?: string | null;
  priority_score?: number | null;
  priority_reasons?: string[];
  predicted_confirm_prob?: number | null;
  modality?: string | null;
  sar_score?: number | null;
  fused_score?: number | null;
  sar_only?: boolean;
  heatmap_spectral_url?: string | null;
  llm_narrative?: string | null;
}

export interface ReviewQuality {
  total_candidates: number;
  displayable_candidates: number;
  cloud_suppressed: number;
  snow_suppressed: number;
  pixel_quality_suppressed: number;
  seasonal_suppressed: number;
  below_threshold_suppressed: number;
  other_quality_suppressed: number;
  source_imagery_unavailable: number;
}

export interface NdviPoint {
  date: string;
  ndvi_mean: number | null;
  ndwi_mean: number | null;
  cloud_fraction: number | null;
}

export interface ChangeEvidence {
  before_date: string;
  after_date: string;
  change_region: string | null;
  visual_difference_summary: string;
  before_ndvi: number | null;
  after_ndvi: number | null;
  ndvi_change: number | null;
  spectral_change: number | null;
  semantic_change: number | null;
  quality: string;
  confound_information: string[];
  candidate_interpretation: string;
  confidence: number | null;
  difference_image_url: string | null;
  changed_fraction: number | null;
  centroid_x: number | null;
  centroid_y: number | null;
  narrative: string;
}

export interface ChangeDetail extends ChangeCandidate {
  before_image_url: string | null;
  after_image_url: string | null;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
  ndvi_series: NdviPoint[];
  quality_notes: string[];
  acquisition_date_source: string | null;
  processing_version: string | null;
  evidence: ChangeEvidence;
  sar_evidence?: {
    sensor: string;
    product_type: string;
    backscatter_coefficient: string;
    before: { vv_db: number; vh_db: number; vv_minus_vh_db: number; valid_fraction: number };
    after: { vv_db: number; vh_db: number; vv_minus_vh_db: number; valid_fraction: number };
    sar_score: number | null;
    fusion_mode: string | null;
    sar_quality: string;
    temporal_match: boolean;
    observations: Array<{ acquisition_datetime: string | null; period_start: string | null; period_end: string | null; processing_version: string | null }>;
  } | null;
}

export interface ReviewDecision {
  decision: 'CONFIRM' | 'REJECT';
  reason?: string;
}

export interface ReviewResponse {
  ok: boolean;
}

export interface AuditLogEntry {
  log_id: string;
  candidate_id: string;
  tile_id: string | null;
  decision: string;
  reason: string | null;
  created_at: string;
  fingerprint?: string | null;
}

export interface Cluster {
  cluster_id: number;
  member_count: number;
  aoi_ids: string[];
  representative_thumbnail_url: string | null;
  label: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ClusterMember {
  tile_id: string;
  vector_id: number | null;
  aoi_id: string;
  date: string;
  thumbnail_url: string | null;
}

export interface OnboardScene {
  scene_id: string;
  date: string | null;
  status: string;
  message: string | null;
}

export interface OnboardJob {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  message: string | null;
  stage?: 'preparing' | 'discovering' | 'resolving' | 'validating' | 'ingesting' | 'finalizing' | 'done' | null;
  stage_detail?: string | null;
  started_at?: string | null;
  aoi_id: string | null;
  scenes_found: number | null;
  scenes_ingested: number | null;
  scenes_failed: number | null;
  scenes_skipped?: number | null;
  tiles_added: number | null;
  warnings: string[];
  scenes: OnboardScene[];
}

export interface TextSearchRequest {
  query: string;
  aoi_id?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  k?: number;
}

export interface VelocityPoint {
  date_pair: { before: string; after: string };
  velocity: number;
  source: string;
}

export interface TemporalEvolutionFrame {
  date: string | null;
  sensor: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  stage: string | null;
  score: number | null;
  score_source: string | null;
  quality: string | null;
  selected: boolean;
  asset_tile_id: string | null;
  asset_aoi_id: string | null;
  location: string | null;
}

export interface TemporalEvolution {
  tile_id: string;
  aoi_id: string | null;
  location: string | null;
  trend: string | null;
  velocity: number | null;
  acceleration: number | null;
  storyline: string | null;
  frames: TemporalEvolutionFrame[];
}

export interface TemporalSignature {
  series: VelocityPoint[];
  velocities: number[];
  score_sources: string[];
  acceleration: number | null;
  trend: string;
  latest_velocity: number | null;
}

export interface VelocityTile extends TemporalSignature {
  tile_id: string;
  first_observation?: string | null;
  latest_observation?: string | null;
}

export interface StorylineProfile {
  short: number | null;
  seasonal: number | null;
  long: number | null;
  score_sources: Record<string, string | null>;
}

export interface Storyline {
  profile: StorylineProfile;
  velocities: number[];
  stage: string;
}

export interface AnalysisRange {
  key: string;
  label: string;
  days: number | null;
  description: string;
}

export interface TileObservation {
  observation_id: number;
  vector_id: number;
  tile_id: string;
  acquisition_date: string;
  acquisition_datetime: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  scene_id: string | null;
  sensor: string | null;
  cloud_fraction: number | null;
  valid_pixel_fraction: number | null;
  ndvi_mean: number | null;
  ndwi_mean: number | null;
  has_sar: boolean;
  sar_observation_id: number | null;
  sar_acquisition_datetime: string | null;
  sar_visual_count: number;
}

export interface TileObservationsResponse {
  tile_id: string;
  observations: TileObservation[];
}

export interface AnalysisObservation {
  date: string;
  source: string;
  sensor: string | null;
  thumbnail_url: string | null;
  quality: string | null;
  score: number | null;
  note?: string | null;
}

export interface OpticalSeries {
  dates: string[];
  ndvi: Array<number | null>;
  ndwi: Array<number | null>;
  cloud_fraction: Array<number | null>;
  [key: string]: string[] | Array<number | null>;
}

export interface SarSeries {
  dates: string[];
  timestamps?: Array<string | null>;
  vv_db?: number[];
  vh_db?: number[];
  vv_mean?: number[];
  vh_mean?: number[];
  valid_fraction?: number[];
  vv_minus_vh_db?: number[];
  vv_minus_vh?: Array<number | null>;
  vv_std?: Array<number | null>;
  vh_std?: Array<number | null>;
}

export interface FusionSeries {
  optical: OpticalSeries;
  sar: SarSeries;
}

export interface AnalysisEvent {
  date: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface AnalysisMetrics {
  ndvi_delta: number | null;
  ndwi_delta: number | null;
  velocity: number | null;
  acceleration: number | null;
  drift: number | null;
  overall_change_score?: number | null;
  overall_velocity?: number | null;
  sar_change?: number | null;
  sar_vv_delta?: number | null;
  sar_vh_delta?: number | null;
}

export interface SpatialLayers {
  difference_heatmap_url: string | null;
  backend_difference_mask_url: string | null;
  ndvi_delta_url: string | null;
  ndwi_delta_url: string | null;
  ndbi_delta_url: string | null;
  ndmi_delta_url: string | null;
  nbr_delta_url: string | null;
  mndwi_delta_url: string | null;
  sar_delta_url: string | null;
}

export interface AnalysisBrief {
  available: boolean;
  brief: string;
  facts: Record<string, unknown>;
}

export interface TemporalAnalysis {
  tile_id: string;
  aoi_id: string | null;
  range: {
    from: string | null;
    to: string | null;
    label: string;
    days: number | null;
  };
  range_days: number | null;
  range_label: string;
  observations: AnalysisObservation[];
  optical: OpticalSeries;
  sar: SarSeries | null;
  before?: { date: string; image_url: string | null; sensor: string | null; quality: number | null } | null;
  after?: { date: string; image_url: string | null; sensor: string | null; quality: number | null } | null;
  velocity?: {
    latest_velocity: number | null;
    acceleration: number | null;
    series: Array<{ date_pair: { before: string; after: string }; velocity: number; source: string }>;
  } | null;
  sar_observations?: Array<{
    sar_id?: number | string;
    acquisition_date: string;
    vv_mean?: number | null;
    vh_mean?: number | null;
    valid_fraction?: number | null;
    sensor?: string | null;
    scene_path?: string | null;
  }>;
  fusion: FusionSeries | null;
  events: AnalysisEvent[];
  metrics: AnalysisMetrics;
  quality?: { range_applied: boolean; observations_used: number; sar_available: boolean } | null;
  visuals?: { before: { date: string; image_url: string | null } | null; after: { date: string; image_url: string | null } | null } | null;
  indices?: Array<{ name: string; before: number | null; after: number | null; delta: number | null; available: boolean }>;
  series?: Array<{ date_pair: { before: string; after: string }; velocity: number; source: string }>;
  sar_evidence?: {
    available: boolean;
    before: SarEvidence | null;
    after: SarEvidence | null;
  };
  spatial_layers?: SpatialLayers;
}

export interface SarEvidence {
  observation_id: number;
  acquisition_datetime: string | null;
  product_type: string | null;
  vv_mean_db: number | null;
  vh_mean_db: number | null;
  vv_minus_vh_db: number | null;
  vv_std_db: number | null;
  vh_std_db: number | null;
  valid_fraction: number | null;
  visuals: { vv_raw: string | null; vh_raw: string | null; rgb_ratio: string | null; sar_urban: string | null };
}
