(() => {
    const ready = callback => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    };

    ready(() => {

        const form = document.getElementById('clicksForm');
        const pad = document.getElementById('clickPad');
        const resetButton = document.getElementById('resetClicks');
        const liveCpsEl = document.getElementById('liveCps');
        const totalClicksEl = document.getElementById('totalClicks');
        const timeStatusEl = document.getElementById('timeStatus');
        const averageEl = document.getElementById('averageCps');
        const padLiveCps = document.getElementById('padLiveCps');
        const graphCanvas = document.getElementById('clicksGraph');
        const saveReportButton = document.getElementById('saveReport');
        const timerButtons = Array.from(document.querySelectorAll('.timer-button'));

        if (
            !form ||
            !pad ||
            !resetButton ||
            !liveCpsEl ||
            !totalClicksEl ||
            !timeStatusEl ||
            !averageEl ||
            !padLiveCps ||
            !graphCanvas ||
            !saveReportButton
        ) {
            return;
        }

        const graphCtx = graphCanvas.getContext('2d');

        const GRAPH_INTERVAL = 100;
        const GRAPH_MAX_POINTS = 500;
        const GRAPH_WINDOW_SECONDS = 5;
        const GRAPH_ANIMATION_DURATION = 600;
        const IDLE_TIMEOUT = 3000;

        let tickerId = null;
        let totalClicks = 0;
        let startTime = null;
        let selectedTimerDuration = Number(
            timerButtons.find(button => button.classList.contains('active'))?.dataset.timerValue
        );
        if (!Number.isFinite(selectedTimerDuration) || selectedTimerDuration < 0) {
            selectedTimerDuration = 0;
        }
        let activeDuration = selectedTimerDuration;
        let isRunning = false;
        let hasSessionData = false;
        let graphWindowSeconds = GRAPH_WINDOW_SECONDS;
        let graphTargetWindow = GRAPH_WINDOW_SECONDS;
        let graphAnimStart = null;
        let graphAnimFrom = GRAPH_WINDOW_SECONDS;
        let lastClickAt = null;
        let graphAverageValue = 0;
        let requireResetAfterTimer = false;
        let graphAnimationFrame = null;
        const graphPoints = [];

        function getSelectedDuration() {
            return selectedTimerDuration;
        }

        const formatSeconds = value => `${value.toFixed(1)}s`;
        const formatCps = value => value.toFixed(2);

        const updateResetState = () => {
            resetButton.disabled = !isRunning && !hasSessionData;
            saveReportButton.disabled = !hasSessionData || isRunning;
        };

        const setActiveTimerButton = value => {
            timerButtons.forEach(button => {
                const matches = Number(button.dataset.timerValue) === value;
                button.classList.toggle('active', matches);
                button.setAttribute('aria-pressed', matches ? 'true' : 'false');
            });
        };

        const setTimerButtonsDisabled = disabled => {
            timerButtons.forEach(button => {
                button.disabled = disabled;
            });
        };

        const resetDisplays = () => {
            liveCpsEl.textContent = '0.00';
            padLiveCps.textContent = '0.00 CPS';
            totalClicksEl.textContent = '0';
            averageEl.textContent = '--';
            timeStatusEl.textContent = '--';
        };

        const updateTotals = () => {

            totalClicksEl.textContent = String(totalClicks);
        };

        const clearTicker = () => {
            if (tickerId) {
                window.clearInterval(tickerId);
                tickerId = null;
            }
        };

        const syncCanvasSize = () => {
            if (!graphCtx) {
                return { width: 0, height: 0, scale: 1 };
            }

            const scale = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.floor(graphCanvas.clientWidth * scale));
            const height = Math.max(1, Math.floor(graphCanvas.clientHeight * scale));
            if (graphCanvas.width !== width || graphCanvas.height !== height) {
                graphCanvas.width = width;
                graphCanvas.height = height;
            }
            return { width, height, scale };
        };

        const drawGraph = () => {
            if (!graphCtx) {
                return;
            }

            const { width, height, scale } = syncCanvasSize();
            graphCtx.clearRect(0, 0, width, height);

            const padding = {
                top: 20 * scale,
                right: 20 * scale,
                bottom: 15 * scale,
                left: 40 * scale
            };
            const chartWidth = Math.max(1, width - padding.left - padding.right);
            const chartHeight = Math.max(1, height - padding.top - padding.bottom);

            const hasPoints = graphPoints.length > 0;
            const lastPoint = hasPoints ? graphPoints[graphPoints.length - 1] : null;
            const maxTime = lastPoint ? lastPoint.time : 0;
            const timerSpan = selectedTimerDuration > 0 ? selectedTimerDuration : null;
            const span = Math.max(graphWindowSeconds, 0.001);
            let viewStart;
            let viewEnd;

            if (timerSpan) {
                viewStart = 0;
                viewEnd = timerSpan;
            } else {
                viewStart = hasPoints
                    ? (span < maxTime ? Math.max(0, maxTime - span) : 0)
                    : 0;
                viewEnd = hasPoints ? Math.max(maxTime, viewStart + span) : span;
            }

            if (viewEnd <= viewStart) {
                viewEnd = viewStart + 0.001;
            }
            const viewDuration = viewEnd - viewStart;

            let visiblePoints = [];
            if (hasPoints) {
                const startIndex = graphPoints.findIndex(point => point.time >= viewStart);
                if (startIndex === -1) {
                    visiblePoints = graphPoints.slice();
                } else if (startIndex === 0) {
                    visiblePoints = graphPoints.slice();
                } else {
                    visiblePoints = graphPoints.slice(startIndex - 1);
                }
            }

            const primaryPoints = visiblePoints.filter(point => point.time >= viewStart);
            const axisSource = primaryPoints.length ? primaryPoints : visiblePoints;
            let axisAverage = Number.isFinite(graphAverageValue) && graphAverageValue > 0
                ? graphAverageValue
                : 0;
            if (!axisAverage && axisSource.length) {
                axisAverage =
                    axisSource.reduce((sum, point) => sum + point.value, 0) /
                    axisSource.length;
            }

            // Adjust y-axis sensitivity: use a moderate dynamic range to keep changes visible
            const desiredRange = Math.max(1, axisAverage * 1.0);
            const halfRange = desiredRange / 2;

            let axisMinValue = axisAverage - halfRange;
            let axisMaxValue = axisAverage + halfRange;

            if (!Number.isFinite(axisMinValue) || !Number.isFinite(axisMaxValue)) {
                axisMinValue = 0;
                axisMaxValue = desiredRange;
            }

            if (timerSpan && axisSource.length) {
                let dataMin = Infinity;
                let dataMax = -Infinity;
                axisSource.forEach(point => {
                    if (point.value < dataMin) dataMin = point.value;
                    if (point.value > dataMax) dataMax = point.value;
                });
                if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
                    dataMin = Math.min(axisAverage, 0);
                    dataMax = Math.max(axisAverage, 1);
                }
                const padding = 0.25;
                axisMinValue = Math.max(0, Math.min(dataMin, axisAverage) - padding);
                axisMaxValue = Math.max(
                    axisMinValue + 0.5,
                    Math.max(dataMax, axisAverage) + padding
                );
            } else {
                if (axisMinValue < 0) {
                    axisMinValue = 0;
                    axisMaxValue = desiredRange;
                } else {
                    axisMaxValue = axisMinValue + desiredRange;
                }
            }

            if (axisMaxValue <= axisMinValue) {
                axisMaxValue = axisMinValue + 1;
            }

            const axisRange = Math.max(axisMaxValue - axisMinValue, 0.001);

            graphCtx.save();
            graphCtx.strokeStyle = '#d8dee4';
            graphCtx.globalAlpha = 0.6;
            graphCtx.lineWidth = 1 * scale;
            graphCtx.fillStyle = '#656d76';
            graphCtx.font = `${Math.max(10, 12 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
            graphCtx.textAlign = 'right';
            graphCtx.textBaseline = 'middle';
            const horizontalLines = 4;
            for (let i = 0; i <= horizontalLines; i += 1) {
                const y = padding.top + (chartHeight / horizontalLines) * i;
                graphCtx.beginPath();
                graphCtx.moveTo(padding.left, y);
                graphCtx.lineTo(width - padding.right, y);
                graphCtx.stroke();

                const value =
                    axisMaxValue - (axisRange / horizontalLines) * i;
                const label =
                    Math.abs(value) >= 10
                        ? Math.round(value).toString()
                        : value.toFixed(1).replace(/\.0$/, '');
                graphCtx.fillText(label, padding.left - 10 * scale, y);
            }
            graphCtx.restore();

            if (!hasPoints || !visiblePoints.length) {
                return;
            }

            const projectY = value => {
                const normalized = (value - axisMinValue) / axisRange;
                const clamped = Math.max(0, Math.min(1, normalized));
                return padding.top + (1 - clamped) * chartHeight;
            };

            graphCtx.lineWidth = Math.max(2, 2.5 * scale);
            graphCtx.strokeStyle = '#0969da';
            graphCtx.lineCap = 'round';
            graphCtx.lineJoin = 'round';
            graphCtx.beginPath();
            visiblePoints.forEach((point, index) => {
                const x =
                    padding.left + ((point.time - viewStart) / viewDuration) * chartWidth;
                const y = projectY(point.value);
                if (index === 0) {
                    graphCtx.moveTo(x, y);
                } else {
                    graphCtx.lineTo(x, y);
                }
            });
            graphCtx.stroke();

            const baselineY = projectY(axisMinValue);
            graphCtx.lineTo(padding.left + chartWidth, baselineY);
            graphCtx.lineTo(padding.left, baselineY);
            graphCtx.closePath();
            graphCtx.fillStyle = 'rgba(9, 105, 218, 0.08)';
            graphCtx.fill();
        };

        const cancelGraphAnimation = () => {
            if (graphAnimationFrame) {
                window.cancelAnimationFrame(graphAnimationFrame);
                graphAnimationFrame = null;
            }
            graphAnimStart = null;
        };

        const resetGraphView = () => {
            cancelGraphAnimation();
            graphWindowSeconds = GRAPH_WINDOW_SECONDS;
            graphTargetWindow = GRAPH_WINDOW_SECONDS;
            graphAnimFrom = GRAPH_WINDOW_SECONDS;
            graphAverageValue = 0;
        };

        const animateGraphToFull = totalDuration => {
            cancelGraphAnimation();
            const finalWindow = Math.max(totalDuration, GRAPH_WINDOW_SECONDS);
            if (!Number.isFinite(finalWindow) || finalWindow <= graphWindowSeconds + 0.05) {
                graphWindowSeconds = finalWindow;
                drawGraph();
                return;
            }

            graphAnimFrom = graphWindowSeconds;
            graphTargetWindow = finalWindow;
            graphAnimStart = performance.now();

            const step = now => {
                const progress = Math.min((now - graphAnimStart) / GRAPH_ANIMATION_DURATION, 1);
                graphWindowSeconds =
                    graphAnimFrom + (graphTargetWindow - graphAnimFrom) * progress;
                drawGraph();
                if (progress < 1) {
                    graphAnimationFrame = window.requestAnimationFrame(step);
                } else {
                    graphAnimationFrame = null;
                }
            };

            graphAnimationFrame = window.requestAnimationFrame(step);
        };

        const addGraphPoint = (time, value) => {
            graphPoints.push({ time, value });
            if (graphPoints.length > GRAPH_MAX_POINTS) {
                graphPoints.shift();
            }
            drawGraph();
        };

        const updateRunningStats = () => {
            if (!isRunning || !startTime) {
                return;
            }

            const now = performance.now();
            const elapsed = Math.max((now - startTime) / 1000, 0);
            const clampedElapsed = activeDuration > 0 ? Math.min(elapsed, activeDuration) : elapsed;
            const remaining = Math.max(activeDuration - elapsed, 0);
            const effectiveElapsed = Math.max(clampedElapsed, 0.001);
            // Require minimum elapsed time and at least 2 clicks before calculating CPS to prevent spikes
            let liveCps = 0;
            const MIN_ELAPSED_FOR_CPS = 0.3;
            if (effectiveElapsed >= MIN_ELAPSED_FOR_CPS && totalClicks >= 2) {
                liveCps = totalClicks / effectiveElapsed;
            } else {
                liveCps = 0;
            }
            graphAverageValue = liveCps;

            liveCpsEl.textContent = formatCps(liveCps);
            padLiveCps.textContent = `${formatCps(liveCps)} CPS`;
            timeStatusEl.textContent =
                activeDuration > 0 ? `${formatSeconds(remaining)} left` : formatSeconds(clampedElapsed);
            updateTotals();
            addGraphPoint(clampedElapsed, liveCps);

            if (activeDuration > 0 && elapsed >= activeDuration) {
                finalizeSession('timer');
                return;
            }

            if (
                activeDuration === 0 &&
                lastClickAt &&
                now - lastClickAt >= IDLE_TIMEOUT
            ) {
                finalizeSession('idle');
                return;
            }
        };

        const startTicker = () => {
            clearTicker();
            tickerId = window.setInterval(updateRunningStats, GRAPH_INTERVAL);
            updateRunningStats();
        };

        const startSession = () => {
            if (isRunning) {
                return;
            }

            if (requireResetAfterTimer) {
                return;
            }

            activeDuration = getSelectedDuration();
            totalClicks = 0;
            graphPoints.length = 0;
            resetGraphView();
            drawGraph();

            startTime = performance.now();
            isRunning = true;
            hasSessionData = true;
            lastClickAt = startTime;
            requireResetAfterTimer = false;
            pad.disabled = false;

            setTimerButtonsDisabled(true);
            liveCpsEl.textContent = '0.00';
            padLiveCps.textContent = '0.00 CPS';
            averageEl.textContent = '--';
            timeStatusEl.textContent =
                activeDuration > 0 ? `${formatSeconds(activeDuration)} left` : formatSeconds(0);
            updateTotals();

            startTicker();
            updateResetState();
        };

        const finalizeSession = reason => {
            if (!isRunning) {
                return;
            }

            clearTicker();
            const now = performance.now();
            let elapsed = startTime ? Math.max((now - startTime) / 1000, 0) : 0;
            let effectiveElapsed = activeDuration > 0 ? Math.min(elapsed, activeDuration) : elapsed;
            
            // For idle timeout, exclude the idle period from calculations
            if (reason === 'idle' && lastClickAt && startTime) {
                const lastClickElapsed = Math.max((lastClickAt - startTime) / 1000, 0);
                effectiveElapsed = activeDuration > 0 ? Math.min(lastClickElapsed, activeDuration) : lastClickElapsed;
                elapsed = lastClickElapsed;
                
                // Filter out graph points from the idle period (last 3 seconds)
                const idleCutoffTime = lastClickElapsed;
                while (graphPoints.length > 0 && graphPoints[graphPoints.length - 1].time > idleCutoffTime) {
                    graphPoints.pop();
                }
            }
            
            const average = effectiveElapsed > 0 ? totalClicks / effectiveElapsed : 0;

            liveCpsEl.textContent = formatCps(average);
            padLiveCps.textContent = `${formatCps(average)} CPS`;
            averageEl.textContent = effectiveElapsed > 0 ? formatCps(average) : '--';
            timeStatusEl.textContent =
                activeDuration > 0 ? `${formatSeconds(0)} left` : formatSeconds(effectiveElapsed);
            graphAverageValue = average;

            requireResetAfterTimer = reason === 'timer';

            isRunning = false;
            startTime = null;
            lastClickAt = null;
            setTimerButtonsDisabled(false);
            updateResetState();
            if (requireResetAfterTimer) {
                pad.disabled = true;
            }

            if (effectiveElapsed > 0) {
                animateGraphToFull(effectiveElapsed);
            }
        };

        const clearSession = () => {
            clearTicker();
            totalClicks = 0;
            startTime = null;
            activeDuration = getSelectedDuration();
            isRunning = false;
            hasSessionData = false;
            graphPoints.length = 0;
            resetGraphView();
            lastClickAt = null;
            drawGraph();
            resetDisplays();
            setTimerButtonsDisabled(false);
            updateResetState();
            requireResetAfterTimer = false;
            pad.disabled = false;
        };

        const handlePadClick = event => {
            event.preventDefault();
            if (typeof event.button === 'number' && event.button !== 0) {
                return false;
            }

            if (!isRunning) {
                startSession();
            }

            if (!isRunning) {
                return false;
            }

            lastClickAt = performance.now();
            totalClicks += 1;
            updateTotals();
            return true;
        };

        let pulseTimeout = null;
        const triggerPadPulse = () => {
            // Clear any pending timeout to prevent lag
            if (pulseTimeout) {
                clearTimeout(pulseTimeout);
                pulseTimeout = null;
            }

            // Restart animation by toggling class
            pad.classList.remove('clicks-pad-hit');
            void pad.offsetWidth; // force reflow
            pad.classList.add('clicks-pad-hit');

            // Remove the class after animation completes
            pulseTimeout = setTimeout(() => {
                pad.classList.remove('clicks-pad-hit');
                pulseTimeout = null;
            }, 150);
        };

        const handleReset = () => {
            if (isRunning) {
                updateRunningStats();
                finalizeSession('manual');
                return;
            }

            if (hasSessionData) {
                clearSession();
            }
        };

        timerButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (isRunning) {
                    return;
                }
                const value = Number(button.dataset.timerValue);
                if (!Number.isFinite(value) || value < 0) {
                    return;
                }
                selectedTimerDuration = value;
                activeDuration = value;
                setActiveTimerButton(value);
            });
        });

        setActiveTimerButton(selectedTimerDuration);

        pad.addEventListener('click', (event) => {
            if (handlePadClick(event)) {
                triggerPadPulse();
            }
        });
        // Removed separate pointerdown listener to prevent double triggering
        pad.addEventListener('keydown', event => {
            if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
                event.preventDefault();
            }
        });
        const generateReportChart = () => {
            // Create a high-quality canvas for the report (wider and shorter)
            const reportCanvas = document.createElement('canvas');
            const reportScale = 2; // 2x resolution for better quality
            const reportWidth = 1200 * reportScale; // Wide format
            const reportHeight = 400 * reportScale; // Shorter height
            reportCanvas.width = reportWidth;
            reportCanvas.height = reportHeight;
            const reportCtx = reportCanvas.getContext('2d');
            
            // Scale for high DPI
            reportCtx.scale(reportScale, reportScale);
            const effectiveWidth = 1200;
            const effectiveHeight = 400;
            
            reportCtx.clearRect(0, 0, effectiveWidth, effectiveHeight);
            
            const padding = {
                top: 30,
                right: 30,
                bottom: 25,
                left: 50
            };
            const chartWidth = effectiveWidth - padding.left - padding.right;
            const chartHeight = effectiveHeight - padding.top - padding.bottom;
            
            const hasPoints = graphPoints.length > 0;
            const lastPoint = hasPoints ? graphPoints[graphPoints.length - 1] : null;
            const maxTime = lastPoint ? lastPoint.time : 0;
            const timerSpan = selectedTimerDuration > 0 ? selectedTimerDuration : null;
            const span = timerSpan || Math.max(maxTime, GRAPH_WINDOW_SECONDS);
            const viewStart = 0;
            const viewEnd = span;
            const viewDuration = viewEnd - viewStart;
            
            const visiblePoints = hasPoints ? graphPoints.slice() : [];
            const primaryPoints = visiblePoints.filter(point => point.time >= viewStart);
            const axisSource = primaryPoints.length ? primaryPoints : visiblePoints;
            
            let axisAverage = Number.isFinite(graphAverageValue) && graphAverageValue > 0
                ? graphAverageValue
                : 0;
            if (!axisAverage && axisSource.length) {
                axisAverage =
                    axisSource.reduce((sum, point) => sum + point.value, 0) /
                    axisSource.length;
            }
            
            const desiredRange = Math.max(1, axisAverage * 1.0);
            const halfRange = desiredRange / 2;
            let axisMinValue = axisAverage - halfRange;
            let axisMaxValue = axisAverage + halfRange;
            
            if (!Number.isFinite(axisMinValue) || !Number.isFinite(axisMaxValue)) {
                axisMinValue = 0;
                axisMaxValue = desiredRange;
            }
            
            if (timerSpan && axisSource.length) {
                let dataMin = Infinity;
                let dataMax = -Infinity;
                axisSource.forEach(point => {
                    if (point.value < dataMin) dataMin = point.value;
                    if (point.value > dataMax) dataMax = point.value;
                });
                if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
                    dataMin = Math.min(axisAverage, 0);
                    dataMax = Math.max(axisAverage, 1);
                }
                const padding = 0.25;
                axisMinValue = Math.max(0, Math.min(dataMin, axisAverage) - padding);
                axisMaxValue = Math.max(
                    axisMinValue + 0.5,
                    Math.max(dataMax, axisAverage) + padding
                );
            } else {
                if (axisMinValue < 0) {
                    axisMinValue = 0;
                    axisMaxValue = desiredRange;
                } else {
                    axisMaxValue = axisMinValue + desiredRange;
                }
            }
            
            if (axisMaxValue <= axisMinValue) {
                axisMaxValue = axisMinValue + 1;
            }
            
            const axisRange = Math.max(axisMaxValue - axisMinValue, 0.001);
            
            // Draw grid lines
            reportCtx.save();
            reportCtx.strokeStyle = '#d8dee4';
            reportCtx.globalAlpha = 0.6;
            reportCtx.lineWidth = 1;
            reportCtx.fillStyle = '#656d76';
            reportCtx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
            reportCtx.textAlign = 'right';
            reportCtx.textBaseline = 'middle';
            const horizontalLines = 4;
            for (let i = 0; i <= horizontalLines; i += 1) {
                const y = padding.top + (chartHeight / horizontalLines) * i;
                reportCtx.beginPath();
                reportCtx.moveTo(padding.left, y);
                reportCtx.lineTo(effectiveWidth - padding.right, y);
                reportCtx.stroke();
                
                const value = axisMaxValue - (axisRange / horizontalLines) * i;
                const label = Math.abs(value) >= 10
                    ? Math.round(value).toString()
                    : value.toFixed(1).replace(/\.0$/, '');
                reportCtx.fillText(label, padding.left - 12, y);
            }
            reportCtx.restore();
            
            if (hasPoints && visiblePoints.length) {
                const projectY = value => {
                    const normalized = (value - axisMinValue) / axisRange;
                    const clamped = Math.max(0, Math.min(1, normalized));
                    return padding.top + (1 - clamped) * chartHeight;
                };
                
                // Draw chart line
                reportCtx.lineWidth = 3;
                reportCtx.strokeStyle = '#0969da';
                reportCtx.lineCap = 'round';
                reportCtx.lineJoin = 'round';
                reportCtx.beginPath();
                visiblePoints.forEach((point, index) => {
                    const x = padding.left + ((point.time - viewStart) / viewDuration) * chartWidth;
                    const y = projectY(point.value);
                    if (index === 0) {
                        reportCtx.moveTo(x, y);
                    } else {
                        reportCtx.lineTo(x, y);
                    }
                });
                reportCtx.stroke();
                
                // Fill area under curve
                const baselineY = projectY(axisMinValue);
                reportCtx.lineTo(padding.left + chartWidth, baselineY);
                reportCtx.lineTo(padding.left, baselineY);
                reportCtx.closePath();
                reportCtx.fillStyle = 'rgba(9, 105, 218, 0.08)';
                reportCtx.fill();
            }
            
            return reportCanvas.toDataURL('image/png', 1.0);
        };

        const saveReport = () => {
            if (!hasSessionData || isRunning) return;
            
            const elapsed = graphPoints.length ? graphPoints[graphPoints.length - 1].time : 0;
            const average = elapsed > 0 ? totalClicks / elapsed : 0;
            const now = new Date();
            const dateStr = now.toLocaleDateString().replace(/\//g, '-');
            
            const reportData = {
                date: now.toLocaleDateString(),
                time: now.toLocaleTimeString(),
                totalClicks,
                duration: formatSeconds(elapsed),
                averageCps: formatCps(average),
                timerMode: activeDuration > 0 ? `${activeDuration}s` : 'Free clicking',
                chartImage: generateReportChart()
            };
            
            // Calculate maxCps and minCps excluding the first second and any 0 values to avoid bias
            const pointsAfterFirstSecond = graphPoints.filter(p => p.time >= 1.0 && p.value > 0);
            const maxCps = pointsAfterFirstSecond.length > 0
                ? Math.max(...pointsAfterFirstSecond.map(p => p.value))
                : (graphPoints.filter(p => p.value > 0).length > 0
                    ? Math.max(...graphPoints.filter(p => p.value > 0).map(p => p.value))
                    : 0);
            const minCps = pointsAfterFirstSecond.length > 0 
                ? Math.min(...pointsAfterFirstSecond.map(p => p.value))
                : (graphPoints.filter(p => p.value > 0).length > 0
                    ? Math.min(...graphPoints.filter(p => p.value > 0).map(p => p.value))
                    : 0);
            const performance = average >= 8 ? 'Excellent' : average >= 6 ? 'Good' : average >= 4 ? 'Average' : 'Beginner';
            
            // Calculate consistency: lower variance = higher consistency
            // Formula: 1 - (range / max) where range = max - min
            // Uses maxCps and minCps which exclude the first second
            let consistency = 0;
            if (maxCps > 0 && minCps > 0) {
                const range = maxCps - minCps;
                consistency = Math.max(0, Math.min(100, (1 - (range / maxCps)) * 100));
            } else if (maxCps > 0) {
                consistency = 0; // If min is 0, consistency is 0
            }
            
            const reportHtml = `
                <!DOCTYPE html>
                <html><head>
                <meta charset="UTF-8">
                <title>Clicks Report - ${reportData.date}</title>
                <style>
                body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;margin:0;padding:40px;background:#f6f8fa;color:#1f2328;line-height:1.6}
                .container{max-width:800px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 3px 6px rgba(140,149,159,0.15)}
                h1{color:#0969da;margin:0 0 8px;font-size:2rem;font-weight:600}
                .subtitle{color:#656d76;margin:0 0 32px;font-size:1rem}
                .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;margin:32px 0}
                .stat-card{background:#f1f4f8;border:1px solid #d0d7de;border-radius:8px;padding:20px;text-align:center}
                .stat-label{font-size:0.85rem;color:#656d76;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;font-weight:600}
                .stat-value{font-size:1.8rem;color:#1f2328;font-weight:600;margin:0}
                .insights{background:#f8fafc;border:1px solid #d0d7de;border-radius:8px;padding:24px;margin:32px 0}
                .insights h3{color:#1f2328;margin:0 0 16px;font-size:1.2rem;font-weight:600}
                .insight-list{list-style:none;padding:0;margin:0}
                .insight-list li{padding:8px 0;border-bottom:1px solid #e1e7f0;font-size:0.95rem}
                .insight-list li:last-child{border-bottom:none}
                .chart-section{margin:40px 0 0}
                .chart-container{background:#f8fafc;border:1px solid #d0d7de;border-radius:8px;padding:24px;text-align:center;overflow:hidden}
                .chart-container h2{color:#1f2328;margin:0 0 20px;font-size:1.3rem;font-weight:600;text-align:left}
                .chart-container img{width:100%;max-height:450px;height:auto;object-fit:contain;border-radius:4px;display:block}
                .footer{margin:40px 0 0;padding:20px 0;border-top:1px solid #d0d7de;text-align:center;color:#656d76;font-size:0.9rem}
                </style></head><body>
                <div class="container">
                <h1>Clicks Performance Report</h1>
                <p class="subtitle">Generated on ${reportData.date} at ${reportData.time}</p>
                <div class="stats-grid">
                <div class="stat-card"><div class="stat-label">Total Clicks</div><div class="stat-value">${reportData.totalClicks}</div></div>
                <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${reportData.duration}</div></div>
                <div class="stat-card"><div class="stat-label">Average CPS</div><div class="stat-value">${reportData.averageCps}</div></div>
                <div class="stat-card"><div class="stat-label">Timer Mode</div><div class="stat-value">${reportData.timerMode}</div></div>
                </div>
                <div class="insights">
                <h3>Performance Summary</h3>
                <ul class="insight-list">
                <li><strong>Performance Level:</strong> ${performance}</li>
                <li><strong>Peak CPS:</strong> ${formatCps(maxCps)}</li>
                <li><strong>Lowest CPS:</strong> ${minCps > 0 ? formatCps(minCps) : 'N/A'}</li>
                <li><strong>Consistency:</strong> ${consistency.toFixed(0)}%</li>
                </ul>
                </div>
                <div class="chart-section">
                <div class="chart-container">
                <h2>Performance Chart</h2>
                <img src="${reportData.chartImage}" alt="Clicks performance chart">
                </div>
                </div>
                <div class="footer">Report generated by bradlot.github.io</div>
                </div></body></html>
            `;
            
            const blob = new Blob([reportHtml], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `clicks-report-${dateStr}.html`;
            a.click();
            URL.revokeObjectURL(url);
        };
        
        saveReportButton.addEventListener('click', saveReport);
        resetButton.addEventListener('click', handleReset);
        form.addEventListener('submit', event => event.preventDefault());
        window.addEventListener('resize', drawGraph);

        drawGraph();
        resetDisplays();
        updateResetState();
    });
})();
