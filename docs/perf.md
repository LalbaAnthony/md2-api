# Performance

Figures measured on 2026-09-22 against the production image, running read only with two virtual
processors and one gibibyte, which is the shape of the `prod` service of `docker/compose.yaml`.

```
docker compose -f docker/compose.yaml build prod
docker run -d --name md2-perf --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --cpus 2 --memory 1g -p 3100:3000 \
  -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=3000 -e LOG_LEVEL=warn md2-prod:latest
node tools/perf-profile.mjs --url=http://127.0.0.1:3100
node tools/load-test.mjs --url=http://127.0.0.1:3100 --duration=30 --connections=8
node --expose-gc tools/soak.mjs --iterations=10000
```

The host is a Windows workstation running Docker Desktop, so every container figure carries the
cost of that virtual machine layer. The same conversion measured on the host directly is roughly
two and a half times faster. These numbers are a baseline to compare against on the same machine,
not a claim about production hardware.

## Against the targets of section 12.5

| Document                            | Target p95   | Measured p95 | Measured p50 |
| ----------------------------------- | ------------ | ------------ | ------------ |
| 5 KiB, no image and no code         | under 40 ms  | 35.3 ms      | 21.8 ms      |
| 50 KiB, 10 code blocks and 3 tables | under 250 ms | 255.0 ms     | 228.5 ms     |
| 500 KiB, 20 images                  | under 3 s    | 1.60 s       | 1.43 s       |

Two of the three targets are met. The 50 KiB document misses by 2 percent on this machine, which
is inside the noise of the virtual machine layer but is reported as a miss rather than rounded
away. It is the document to watch when the pipeline changes.

## Where the time goes

Measured in process on the host, on the 50 KiB document with 10 code blocks, 3 tables and 560
blocks in total, from the conversion log line:

| Phase         | Time  | Share |
| ------------- | ----- | ----- |
| `packMs`      | 40 ms | 42 %  |
| `parseMs`     | 36 ms | 37 %  |
| `normalizeMs` | 11 ms | 11 %  |
| `renderMs`    | 9 ms  | 9 %   |
| `compileMs`   | 0 ms  | 0 %   |

Binary serialisation first, as section 12.5 expects. The second cost is not Shiki but remark: the
highlighter cache absorbs tokenisation, which lives inside `normalizeMs` along with the image work,
while parsing pays for every one of the 560 blocks. Theme compilation is free after the first
conversion because the compiled form is cached per identifier and content hash.

`sharp` becomes the dominant cost as soon as a document carries images, which is what separates
the 500 KiB row above from the other two.

## Under load

50 KiB document, 30 seconds, `POST /convert`, against the container:

| Connections | Requests per second | p50 latency | p95 latency | Non 2xx | Errors |
| ----------- | ------------------- | ----------- | ----------- | ------- | ------ |
| 1           | 1.6                 | 610 ms      | 772 ms      | 0       | 0      |
| 2           | 1.6                 | 1.18 s      | 1.28 s      | 0       | 0      |
| 8           | 1.44                | 5.11 s      | 6.73 s      | 0       | 0      |

Throughput is flat across concurrency because a conversion is processor bound and the process is
single threaded: adding connections adds queueing latency and nothing else. Nothing was refused
and nothing timed out, so the semaphore and its bounded queue absorbed the eight connections
without shedding, and `under-pressure` never tripped.

The way to serve more is more processes, one per pair of virtual processors, behind a load
balancer. The `worker_threads` pool of section 19.1 is the alternative, and it is deliberately not
in the V1.

## Memory over 10 000 conversions

`node --expose-gc tools/soak.mjs --iterations=10000 --warmup=500`, on the host, on a 7.9 KiB
document:

| Measure           | Value                 |
| ----------------- | --------------------- |
| Conversions       | 10 000                |
| Failures          | 0                     |
| Resident at start | 498.9 MiB             |
| Resident at end   | 514.0 MiB             |
| Resident peak     | 514.9 MiB             |
| Growth            | 3.0 %                 |
| p50 / p95 / p99   | 21.9 / 31.8 / 42.8 ms |

Resident memory is measured after a forced collection at both ends, following a 500 conversion
warm up that loads the Shiki grammars and fills the theme cache. Three percent of drift over ten
thousand conversions is the end of lot criterion, and the script exits non zero above ten percent,
so it can run unattended.

The resident baseline of roughly 500 MiB is dominated by the Shiki grammars and the `sharp`
runtime, not by the documents. It sits under the `under-pressure` thresholds of section 12.4,
which are 700 MiB of heap and 900 MiB resident, and under the one gibibyte of the container.

## No result cache

Section 12.5 asks for a result cache keyed by the markdown, the theme hash, the format and the
options only after a measurement shows a real repetition rate. Nothing here measures one, so there
is no result cache. The caches that exist are the compiled theme, keyed by identifier and content
hash, and the Shiki highlighter, both of which pay for themselves on the first repeat.
