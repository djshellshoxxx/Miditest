#pragma once

#include <array>
#include <atomic>
#include <cstddef>

namespace miditest
{
template <typename T, std::size_t Capacity>
class SpscEventQueue
{
public:
    static_assert(Capacity > 1);

    bool tryPush(const T& value) noexcept
    {
        const auto write = writeIndex.load(std::memory_order_relaxed);
        const auto next = increment(write);
        if (next == readIndex.load(std::memory_order_acquire))
            return false;
        storage[write] = value;
        writeIndex.store(next, std::memory_order_release);
        return true;
    }

    bool tryPop(T& value) noexcept
    {
        const auto read = readIndex.load(std::memory_order_relaxed);
        if (read == writeIndex.load(std::memory_order_acquire))
            return false;
        value = storage[read];
        readIndex.store(increment(read), std::memory_order_release);
        return true;
    }

    void reset() noexcept
    {
        readIndex.store(0, std::memory_order_release);
        writeIndex.store(0, std::memory_order_release);
    }

private:
    static constexpr std::size_t storageSize = Capacity + 1;
    static constexpr std::size_t increment(std::size_t index) noexcept { return (index + 1) % storageSize; }

    std::array<T, storageSize> storage {};
    std::atomic<std::size_t> readIndex { 0 };
    std::atomic<std::size_t> writeIndex { 0 };
};
}
