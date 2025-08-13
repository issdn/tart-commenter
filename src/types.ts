interface NavigationTarget {
  kind: string;
  fileIndex: number;
  offset: number;
  length: number;
  startLine: number;
  startColumn: number;
  name: string;
}

interface NavigationRegion {
  offset: number;
  length: number;
  targets: number[];
}

interface NavigationResponse {
  id: string;
  result?: {
    files: string[];
    targets: NavigationTarget[];
    regions: NavigationRegion[];
  };
  error?: {
    code: string;
    message: string;
  };
}

export type { NavigationTarget, NavigationRegion, NavigationResponse };
