#pragma once
#include <array>
#include <bitset>
#include <cstdint>
#include <deque>
#include <mutex>
#include <string>
#include <vector>

namespace miditest {

enum class EventKind : uint8_t {
    NoteOn, NoteOff, PolyPressure, ControlChange, ProgramChange, ChannelPressure,
    PitchBend, Clock, Start, Continue, Stop, SongPosition, ActiveSense, SysEx,
    System, Count
};

struct Event {
    double seconds{};
    EventKind kind{EventKind::System};
    int channel{};
    int a{};
    int b{};
    int value{};
    std::array<uint8_t, 256> bytes{};
    uint16_t storedBytes{};
    uint32_t originalBytes{};
};

struct RunningStats {
    uint64_t count{};
    double mean{};
    double m2{};
    int min{0};
    int max{0};
    void push(int v);
    double stdev() const;
};

struct ControlStats {
    uint64_t count{};
    int min{127};
    int max{0};
    int last{};
    uint64_t repeated{};
    uint64_t jumps{};
    uint64_t reversals{};
    int lastDirection{};
    RunningStats recent;
    std::bitset<128> unique;
    double coverage() const;
};

struct Snapshot {
    uint64_t totalEvents{};
    size_t historyEvents{};
    std::array<uint64_t, static_cast<size_t>(EventKind::Count)> messageCounts{};
    std::array<uint64_t, 16> channelCounts{};
    std::array<bool, 128> notesSeen{};
    std::array<bool, 128> heldNotes{};
    uint64_t duplicateNoteOns{};
    uint64_t unmatchedNoteOffs{};
    uint64_t disconnects{};
    size_t controlsSeen{};
    int pitchMin{};
    int pitchMax{};
    double pitchCenterMean{};
    double pitchCenterStdev{};
    double clockBpm{};
    double currentRate{};
    double peakRate{};
};

class DiagnosticModel {
public:
    static constexpr size_t maxHistory = 5000;
    void reset();
    void ingest(const uint8_t* data, size_t size, double seconds);
    Snapshot snapshot() const;
    ControlStats control(int channel1Based, int cc) const;
    std::vector<Event> eventsCopy() const;
    std::string reportJson(const std::string& device, const std::string& mode) const;
    std::string captureCsv() const;

private:
    static Event decode(const uint8_t* data, size_t size, double seconds);
    static size_t kindIndex(EventKind kind) { return static_cast<size_t>(kind); }
    void updateRate(double seconds);

    mutable std::mutex mutex_;
    std::deque<Event> history_;
    std::deque<double> oneSecondTimes_;
    std::deque<double> clockIntervals_;
    std::array<uint64_t, static_cast<size_t>(EventKind::Count)> messageCounts_{};
    std::array<uint64_t, 16> channelCounts_{};
    std::array<ControlStats, 16 * 128> controls_{};
    std::array<std::array<bool, 128>, 16> activeNotes_{};
    std::array<bool, 128> notesSeen_{};
    RunningStats velocities_;
    RunningStats pitchCenter_;
    uint64_t totalEvents_{};
    uint64_t duplicateNoteOns_{};
    uint64_t unmatchedNoteOffs_{};
    size_t controlsSeen_{};
    int pitchMin_{8191};
    int pitchMax_{-8192};
    double lastClock_{-1.0};
    double currentRate_{};
    double peakRate_{};
};

const char* kindName(EventKind kind);

} // namespace miditest
