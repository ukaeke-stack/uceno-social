using UnityEngine;
using UnityEngine.EventSystems;

/// <summary>
/// Attach to two transparent, raycast-enabled UI Images inside a Canvas.
/// Set one zone to Move (left side) and one to Look (right side).
/// This is prototype input plumbing; the Canvas and visual controls still need to be assembled in Unity.
/// </summary>
public sealed class MobileTouchZone : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
{
    public enum ZoneMode { Move, Look }

    [SerializeField] private ZoneMode mode = ZoneMode.Move;
    [SerializeField, Min(20f)] private float movementRadius = 100f;
    [SerializeField, Min(0.001f)] private float lookScale = 0.12f;

    public static Vector2 MoveInput { get; private set; }
    public static Vector2 LookDelta { get; private set; }

    private int activePointerId = int.MinValue;
    private Vector2 origin;

    public void OnPointerDown(PointerEventData eventData)
    {
        if (activePointerId != int.MinValue) return;
        activePointerId = eventData.pointerId;
        origin = eventData.position;
        Apply(eventData.position);
    }

    public void OnDrag(PointerEventData eventData)
    {
        if (eventData.pointerId != activePointerId) return;
        Apply(eventData.position);
    }

    public void OnPointerUp(PointerEventData eventData)
    {
        if (eventData.pointerId != activePointerId) return;
        activePointerId = int.MinValue;
        if (mode == ZoneMode.Move) MoveInput = Vector2.zero;
    }

    private void Apply(Vector2 position)
    {
        Vector2 delta = position - origin;
        if (mode == ZoneMode.Move)
            MoveInput = Vector2.ClampMagnitude(delta / movementRadius, 1f);
        else
            LookDelta += delta * lookScale;
        origin = position;
    }

    /// <summary>Called once per frame by the camera after consuming look input.</summary>
    public static Vector2 ConsumeLookDelta()
    {
        Vector2 value = LookDelta;
        LookDelta = Vector2.zero;
        return value;
    }

    private void OnDisable()
    {
        if (mode == ZoneMode.Move) MoveInput = Vector2.zero;
        if (mode == ZoneMode.Look) LookDelta = Vector2.zero;
        activePointerId = int.MinValue;
    }
}