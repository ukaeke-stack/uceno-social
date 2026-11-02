using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.ResourceManagement.ResourceLocations;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Downloads labeled world content on demand. Addressables owns the persistent
    /// cache; this component never stores bearer tokens or private download URLs.
    /// Configure the remote catalog through the Inspector/build profile.
    /// </summary>
    public sealed class WorldContentDelivery : MonoBehaviour
    {
        [SerializeField] private string remoteCatalogUrl;
        [SerializeField] private string[] preloadLabels = Array.Empty<string>();
        [SerializeField, Min(1)] private int maxAttempts = 3;
        [SerializeField, Min(0.25f)] private float retryDelaySeconds = 2f;
        [SerializeField, Min(1)] private int maxConcurrentResidentLabels = 4;

        public event Action<string, float> ProgressChanged;
        public event Action<string> StatusChanged;
        public event Action<string> ContentReady;
        public event Action<string> ContentFailed;

        private readonly HashSet<string> readyLabels = new HashSet<string>(StringComparer.Ordinal);
        private readonly Dictionary<string, AsyncOperationHandle<IList<UnityEngine.Object>>> residentHandles =
            new Dictionary<string, AsyncOperationHandle<IList<UnityEngine.Object>>>(StringComparer.Ordinal);
        private readonly Dictionary<string, int> residencyReferences =
            new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly HashSet<string> residencyLoads = new HashSet<string>(StringComparer.Ordinal);
        private readonly Dictionary<string, AsyncOperationHandle<IList<UnityEngine.Object>>> pendingLoadHandles =
            new Dictionary<string, AsyncOperationHandle<IList<UnityEngine.Object>>>(StringComparer.Ordinal);
        private bool initialized;
        private bool initializing;

        public bool IsInitialized => initialized;

        private IEnumerator Start()
        {
            yield return InitializeRoutine(null);
        }

        public void EnsureContent(string label, Action<bool, string> completed = null)
        {
            if (string.IsNullOrWhiteSpace(label))
            {
                completed?.Invoke(false, "A content label is required.");
                return;
            }
            StartCoroutine(EnsureContentRoutine(label.Trim(), completed));
        }

        public void AcquireContent(string label, Action<bool, string> completed = null)
        {
            if (string.IsNullOrWhiteSpace(label))
            {
                completed?.Invoke(false, "A content label is required.");
                return;
            }
            StartCoroutine(AcquireContentRoutine(label.Trim(), completed));
        }

        private IEnumerator AcquireContentRoutine(string label, Action<bool, string> completed)
        {
            bool downloaded = false;
            string downloadError = null;
            yield return EnsureContentRoutine(label, (ok, error) =>
            {
                downloaded = ok;
                downloadError = error;
            });
            if (!downloaded)
            {
                completed?.Invoke(false, downloadError);
                yield break;
            }

            // Coalesce concurrent loads for the same label. A successful lease
            // keeps its Addressables handle alive until every consumer releases it.
            while (residencyLoads.Contains(label)) yield return null;
            if (residentHandles.ContainsKey(label))
            {
                residencyReferences[label] = residencyReferences[label] + 1;
                completed?.Invoke(true, null);
                yield break;
            }

            if (residentHandles.Count + residencyLoads.Count >= Mathf.Max(1, maxConcurrentResidentLabels))
            {
                completed?.Invoke(false, "The active resident-label limit has been reached. Leave another area before loading this one.");
                ContentFailed?.Invoke(label);
                yield break;
            }

            residencyLoads.Add(label);
            AsyncOperationHandle<IList<UnityEngine.Object>> load =
                Addressables.LoadAssetsAsync<UnityEngine.Object>(label, null);
            pendingLoadHandles[label] = load;
            yield return load;
            pendingLoadHandles.Remove(label);
            residencyLoads.Remove(label);
            if (load.Status != AsyncOperationStatus.Succeeded || load.Result == null || load.Result.Count == 0)
            {
                Addressables.Release(load);
                completed?.Invoke(false, "Downloaded content could not be loaded into memory.");
                ContentFailed?.Invoke(label);
                yield break;
            }

            residentHandles[label] = load;
            residencyReferences[label] = 1;
            StatusChanged?.Invoke(label + " loaded into memory.");
            completed?.Invoke(true, null);
        }

        public void ReleaseContent(string label)
        {
            if (string.IsNullOrWhiteSpace(label) || !residencyReferences.TryGetValue(label, out int count))
                return;
            if (count > 1)
            {
                residencyReferences[label] = count - 1;
                return;
            }

            residencyReferences.Remove(label);
            if (residentHandles.TryGetValue(label, out AsyncOperationHandle<IList<UnityEngine.Object>> handle))
            {
                residentHandles.Remove(label);
                Addressables.Release(handle);
                StatusChanged?.Invoke(label + " released from memory.");
                StartCoroutine(UnloadUnusedAssetsRoutine());
            }
        }

        private IEnumerator UnloadUnusedAssetsRoutine()
        {
            // Addressables releases its references immediately; Unity performs
            // the final native-object reclamation asynchronously.
            yield return Resources.UnloadUnusedAssets();
        }

        private void OnDestroy()
        {
            foreach (AsyncOperationHandle<IList<UnityEngine.Object>> handle in residentHandles.Values)
                if (handle.IsValid()) Addressables.Release(handle);
            foreach (AsyncOperationHandle<IList<UnityEngine.Object>> handle in pendingLoadHandles.Values)
                if (handle.IsValid()) Addressables.Release(handle);
            pendingLoadHandles.Clear();
            residentHandles.Clear();
            residencyReferences.Clear();
            residencyLoads.Clear();
        }

        public void PreloadConfiguredContent(Action<bool, string> completed = null)
        {
            StartCoroutine(PreloadRoutine(completed));
        }

        private IEnumerator InitializeRoutine(Action<bool, string> completed)
        {
            if (initialized)
            {
                completed?.Invoke(true, null);
                yield break;
            }
            if (initializing)
            {
                while (initializing) yield return null;
                completed?.Invoke(initialized, initialized ? null : "Content delivery initialization failed.");
                yield break;
            }

            initializing = true;
            StatusChanged?.Invoke("Initializing content delivery...");
            AsyncOperationHandle init = Addressables.InitializeAsync();
            yield return init;
            if (init.Status != AsyncOperationStatus.Succeeded)
            {
                initializing = false;
                StatusChanged?.Invoke("Content service unavailable. Retry when connected.");
                completed?.Invoke(false, "Addressables initialization failed.");
                yield break;
            }

            if (!string.IsNullOrWhiteSpace(remoteCatalogUrl))
            {
                AsyncOperationHandle<IResourceLocator> catalog = Addressables.LoadContentCatalogAsync(remoteCatalogUrl.Trim(), true);
                yield return catalog;
                if (catalog.Status != AsyncOperationStatus.Succeeded)
                {
                    initializing = false;
                    StatusChanged?.Invoke("World content catalog could not be reached.");
                    completed?.Invoke(false, "Remote catalog load failed.");
                    yield break;
                }
            }

            initialized = true;
            initializing = false;
            StatusChanged?.Invoke("Content service ready.");
            completed?.Invoke(true, null);
        }

        private IEnumerator EnsureContentRoutine(string label, Action<bool, string> completed)
        {
            bool initOk = false;
            string initError = null;
            yield return InitializeRoutine((ok, error) => { initOk = ok; initError = error; });
            if (!initOk)
            {
                completed?.Invoke(false, initError);
                ContentFailed?.Invoke(label);
                yield break;
            }

            if (readyLabels.Contains(label))
            {
                completed?.Invoke(true, null);
                yield break;
            }

            string lastError = "Download did not complete.";
            for (int attempt = 1; attempt <= Mathf.Max(1, maxAttempts); attempt++)
            {
                StatusChanged?.Invoke("Preparing " + label + " (attempt " + attempt + ")...");
                AsyncOperationHandle<long> sizeHandle = Addressables.GetDownloadSizeAsync(label);
                yield return sizeHandle;
                if (sizeHandle.Status != AsyncOperationStatus.Succeeded)
                {
                    lastError = "Could not calculate the content download size.";
                    Addressables.Release(sizeHandle);
                    if (attempt < maxAttempts) yield return new WaitForSecondsRealtime(retryDelaySeconds);
                    continue;
                }

                long bytes = sizeHandle.Result;
                Addressables.Release(sizeHandle);
                if (bytes <= 0)
                {
                    readyLabels.Add(label);
                    ProgressChanged?.Invoke(label, 1f);
                    ContentReady?.Invoke(label);
                    completed?.Invoke(true, null);
                    yield break;
                }

                AsyncOperationHandle download = Addressables.DownloadDependenciesAsync(label, false);
                while (!download.IsDone)
                {
                    ProgressChanged?.Invoke(label, download.PercentComplete);
                    yield return null;
                }

                if (download.Status == AsyncOperationStatus.Succeeded)
                {
                    ProgressChanged?.Invoke(label, 1f);
                    readyLabels.Add(label);
                    Addressables.Release(download);
                    StatusChanged?.Invoke(label + " is ready.");
                    ContentReady?.Invoke(label);
                    completed?.Invoke(true, null);
                    yield break;
                }

                lastError = "Download failed. Check the connection and retry.";
                Addressables.Release(download);
                if (attempt < maxAttempts)
                    yield return new WaitForSecondsRealtime(retryDelaySeconds * attempt);
            }

            StatusChanged?.Invoke(lastError);
            ContentFailed?.Invoke(label);
            completed?.Invoke(false, lastError);
        }

        private IEnumerator PreloadRoutine(Action<bool, string> completed)
        {
            bool ok = true;
            string error = null;
            foreach (string label in preloadLabels)
            {
                if (string.IsNullOrWhiteSpace(label)) continue;
                bool itemOk = false;
                string itemError = null;
                yield return EnsureContentRoutine(label.Trim(), (success, message) =>
                {
                    itemOk = success;
                    itemError = message;
                });
                if (!itemOk)
                {
                    ok = false;
                    error = itemError;
                    break;
                }
            }
            completed?.Invoke(ok, error);
        }
    }
}