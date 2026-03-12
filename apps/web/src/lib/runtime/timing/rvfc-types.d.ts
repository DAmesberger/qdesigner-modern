/**
 * TypeScript declarations for the requestVideoFrameCallback API.
 *
 * @see https://wicg.github.io/video-rvfc/
 */

interface VideoFrameCallbackMetadata {
  /** The time at which the user agent submitted the frame for composition. */
  presentationTime: DOMHighResTimeStamp;
  /** The expected time at which the frame will be displayed. */
  expectedDisplayTime: DOMHighResTimeStamp;
  /** The width of the video frame, in media pixels. */
  width: number;
  /** The height of the video frame, in media pixels. */
  height: number;
  /** The media presentation timestamp (PTS) of the frame, in seconds. */
  mediaTime: number;
  /** The elapsed time in seconds since the HTMLVideoElement's readyState first became > 0. */
  presentedFrames: number;
  /**
   * The time at which the compositor received the frame from the decoder.
   * Only available when `captureTimestamp` is supported.
   */
  captureTime?: DOMHighResTimeStamp;
  /**
   * The time at which the encoded frame was received by the platform.
   * Only available when `receiveTime` is supported.
   */
  receiveTime?: DOMHighResTimeStamp;
  /**
   * The RTP timestamp associated with the video frame.
   * Only available for WebRTC-sourced video.
   */
  rtpTimestamp?: number;
  /**
   * The estimated number of frames composed to the display since the
   * last time metadata with a new `presentationTime` was provided.
   */
  processingDuration?: number;
}

type VideoFrameRequestCallback = (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void;

interface HTMLVideoElement {
  requestVideoFrameCallback(callback: VideoFrameRequestCallback): number;
  cancelVideoFrameCallback(handle: number): void;
}
