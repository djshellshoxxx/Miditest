#include "../src/DiagnosticModel.h"
#include <cstdlib>
#include <cmath>
#include <cstdint>
#include <iostream>

using namespace miditest;

#define CHECK(x) do { if (!(x)) { std::cerr << "CHECK failed: " #x << " at " << __FILE__ << ':' << __LINE__ << '\n'; std::exit(1); } } while(false)

static void basicProtocolTests() {
    DiagnosticModel m;
    const uint8_t on[]{0x90,60,100}, off[]{0x90,60,0}, cc0[]{0xB0,7,0}, cc127[]{0xB0,7,127}, bend[]{0xE0,0,64};
    m.ingest(on,3,0.0); m.ingest(off,3,0.1); m.ingest(cc0,3,0.2); m.ingest(cc127,3,0.3); m.ingest(bend,3,0.4);
    auto s=m.snapshot();
    CHECK(s.totalEvents==5); CHECK(s.notesSeen[60]); CHECK(!s.heldNotes[60]);
    auto c=m.control(1,7); CHECK(c.count==2); CHECK(c.min==0); CHECK(c.max==127); CHECK(c.coverage()>99.9);
    CHECK(s.pitchMin==0 && s.pitchMax==0);
}

static void pairingTests() {
    DiagnosticModel m; const uint8_t on[]{0x91,64,90}, off[]{0x81,64,0};
    m.ingest(on,3,0.0); m.ingest(on,3,0.1); m.ingest(off,3,0.2); m.ingest(off,3,0.3);
    const auto s=m.snapshot(); CHECK(s.duplicateNoteOns==1); CHECK(s.unmatchedNoteOffs==1);
}

static void clockTests() {
    DiagnosticModel m; const uint8_t clock[]{0xF8};
    const double tick=60.0/120.0/24.0;
    for(int i=0;i<96;++i)m.ingest(clock,1,i*tick);
    CHECK(std::abs(m.snapshot().clockBpm-120.0)<0.01);
}

static void sysexBoundTest() {
    DiagnosticModel m; uint8_t bytes[600]{}; bytes[0]=0xF0; bytes[599]=0xF7;
    m.ingest(bytes,600,0.0); const auto e=m.eventsCopy().back();
    CHECK(e.kind==EventKind::SysEx); CHECK(e.originalBytes==600); CHECK(e.storedBytes==256);
}

static void stressTest() {
    DiagnosticModel m; double t=0.0;
    for (int i=0;i<1000000;++i) {
        uint8_t msg[3]{};
        switch(i%5) {
            case 0: msg[0]=0x90; msg[1]=static_cast<uint8_t>(36+(i%60)); msg[2]=static_cast<uint8_t>(1+(i%127)); break;
            case 1: msg[0]=0x80; msg[1]=static_cast<uint8_t>(36+(i%60)); break;
            case 2: msg[0]=0xB0; msg[1]=static_cast<uint8_t>(i%128); msg[2]=static_cast<uint8_t>((i*17)%128); break;
            case 3: msg[0]=0xE0; msg[1]=static_cast<uint8_t>(i&127); msg[2]=static_cast<uint8_t>((i>>7)&127); break;
            default: msg[0]=0xD0; msg[1]=static_cast<uint8_t>(i%128); break;
        }
        m.ingest(msg,(msg[0]&0xF0)==0xC0||(msg[0]&0xF0)==0xD0?2:3,t);
        t += 0.0001;
    }
    const auto s=m.snapshot();
    CHECK(s.totalEvents==1000000); CHECK(s.historyEvents==DiagnosticModel::maxHistory);
    CHECK(s.controlsSeen==128); CHECK(s.peakRate>9000.0);
    const auto json=m.reportJson("Stress Device","test"); CHECK(json.find("\"events\": 1000000")!=std::string::npos);
}

int main() {
    basicProtocolTests(); pairingTests(); clockTests(); sysexBoundTest(); stressTest();
    std::cout << "MIDItest native core + stress tests: PASS\n";
}
