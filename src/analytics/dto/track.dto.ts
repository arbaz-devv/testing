export class TrackDto {
  path?: string;
  device?: string;
  timezone?: string;
  event?: 'page_view' | 'page_leave';
  sessionId?: string;
  enteredAt?: string;
  leftAt?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}
