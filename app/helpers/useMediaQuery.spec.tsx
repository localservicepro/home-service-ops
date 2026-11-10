import { renderHook } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  let matchMedia: Mock;
  let addListener: Mock;
  let removeListener: Mock;

  beforeEach(() => {
    addListener = vi.fn();
    removeListener = vi.fn();

    matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: addListener,
      removeEventListener: removeListener,
    });

    (window as any).matchMedia = matchMedia;
  });

  it("should return false by default", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
  });

  it("should call matchMedia with the provided query", () => {
    const query = "(min-width: 768px)";
    renderHook(() => useMediaQuery(query));
    expect(matchMedia).toHaveBeenCalledWith(query);
  });

  it("should add event listener on mount", () => {
    renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(addListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("should remove event listener on unmount", () => {
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    unmount();
    expect(removeListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});

